// ===============================
// File: toolRegistry.js
// Purpose: Central hub for registering, validating, and executing tools.
// ===============================

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export class ToolRegistry {
    constructor(config = {}) {
        this.tools = new Map(); // Stores executable functions
        this.schemas = [];      // Stores JSON schemas for the LLM API
        this.logger = config.logger;
    }

    /**
     * Register a new tool for the agent to use.
     * @param {string} name - Unique name (e.g., "get_weather").
     * @param {string} description - Description for the LLM.
     * @param {z.ZodObject} parameters - Zod schema defining the arguments.
     * @param {Function} func - The async function to execute.
     */
    register(name, description, parameters, func) {
        if (this.tools.has(name)) {
            console.warn(`[ToolRegistry] Overwriting tool: ${name}`);
        }

        // 1. Store the executable function
        this.tools.set(name, func);

        // 2. Validate Input
        if (!parameters || typeof parameters.parse !== 'function') {
            console.error(`[ToolRegistry] Error: Tool '${name}' has an invalid Zod schema.`);
            return;
        }

        // 3. Convert Zod to JSON Schema
        // We use the basic conversion which usually returns { type: 'object', properties: {...} }
        const jsonSchema = zodToJsonSchema(parameters);

        // DEBUG LOG: See exactly what the converter produced
        // console.log(`[ToolRegistry] Raw Schema for ${name}:`, JSON.stringify(jsonSchema, null, 2));

        // 4. Extract fields safely
        // If the conversion failed (empty object), these default to empty
        const properties = jsonSchema.properties || {};
        const required = jsonSchema.required || [];

        // Check if conversion actually worked
        if (Object.keys(properties).length === 0 && Object.keys(parameters.shape || {}).length > 0) {
            console.warn(`[ToolRegistry] WARNING: Schema conversion for '${name}' resulted in empty properties.`);
            console.warn(`   ➜ Hints: 1. Run 'npm install zod@latest zod-to-json-schema@latest'`);
            console.warn(`   ➜ Hints: 2. Ensure you are importing 'z' from the same place.`);
        }

        // 5. Add to API list
        this.schemas.push({
            type: "function",
            function: {
                name,
                description,
                parameters: {
                    type: "object",
                    properties: properties,
                    required: required,
                },
            },
        });
    }

    /**
     * Executes a tool by name with provided arguments.
     */
    async execute(name, args) {
        const toolFunc = this.tools.get(name);
        if (!toolFunc) {
            return JSON.stringify({ error: `Tool '${name}' not found.` });
        }

        // Log Start
        if (this.logger) this.logger.toolStart(name, args);

        try {
            // Execute the function
            const result = await toolFunc(args);

            // Log End
            if (this.logger) this.logger.toolEnd(name, result);

            // Ensure result is a string for the LLM
            if (typeof result === 'object') {
                return JSON.stringify(result);
            }
            return String(result);
        } catch (err) {
            if (this.logger) this.logger.error("ToolRegistry", `Execution Error (${name})`, err.stack);
            console.error(`[ToolRegistry] Execution Error (${name}):`, err); // Fallback standard log
            return JSON.stringify({ error: err.message });
        }
    }

    getAPITools() {
        return this.schemas;
    }
}