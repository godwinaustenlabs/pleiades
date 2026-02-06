// ======================================================
// File: test.js
// Purpose: Verify the Nova Agent Framework with a custom Calculator tool
// ======================================================

import { Pipeline } from './pipeline.js'; // Adjust path if needed
import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables (API Keys)
dotenv.config();

// 1. Define a Custom External Tool (Calculator)
const calculatorTool = {
    name: "family-tree",
    description: "A useful tool for knowing the relative name",
    // Zod Schema defines the shape of the JSON the LLM must send
    schema: z.object({
        relation: z.enum(["mother", "father", "sister", "brother"]).describe("relation with the user"),
    }),
    // The actual JavaScript logic to execute
    func: async ({ relation }) => {
        console.log(`[Tool:Calculator] Executing: ${relation}`);
        switch (relation) {
            case "mother": return "mother is farha";
            case "father": return "father is talha";
            case "sister": return "sister is maryam";
            case "brother": return "brother is saad";
            default: return "Error: Unknown operation";
        }
    }
};

// 2. Main Test Runner
async function runTest() {
    console.log("🚀 Starting Nova Pipeline Test...\n");

    // Check for API Keys
    if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
        console.error("❌ Error: Please set OPENAI_API_KEY or GROQ_API_KEY in your .env file.");
        process.exit(1);
    }

    // 3. Initialize the Pipeline
    const agent = new Pipeline({
        // Context Manager Config (Memory)
        ctxManagerConfig: {
            clientId: "test-user-01",
            agentId: "nova-math-agent",
            memory: {
                memoryType: "nomemory", // Use simple in-memory buffer for testing (no DB needed)
                limitTurns: 10
            }
        },

        // LLM Config (Provider: OpenAI or Groq)
        llmConfig: {
            model: "llama-3.3-70b-versatile", // or "llama3-70b-8192" for Groq
            verbose: true, // Enable detailed logs
            api_keys: {
                openai: process.env.OPENAI_API_KEY,
                groq: process.env.GROQ_API_KEY,
                gemini: process.env.GEMINI_API_KEY
            },
            // cloudflare: { ... } // Optional: Add if testing Gateway
        },

        // Prompt Builder Config
        promptBuilderConfig: {
            systemPrompt: "Use the family tree tool for finding relative name."
        },

        // 4. Inject External Tools
        tools: [calculatorTool]
    });

    // 5. Run the "Thinking" Loop
    const userQuery = "What is the name of mother";

    console.log(`👤 User: "${userQuery}"`);
    console.log("🤖 Agent: Thinking...");

    try {
        const response = await agent.run(userQuery);

        console.log("\n✅ Final Response:");
        console.log("-----------------------------------");
        console.log(response);
        console.log("-----------------------------------");
    } catch (error) {
        console.error("\n❌ Pipeline Failed:", error);
    }
}

// Execute
runTest();