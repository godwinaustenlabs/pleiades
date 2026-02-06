// ======================================================
// File: llm.js
// Purpose: Unified LLM API handler with Robust Error Tracking, Self-Healing & Full Logging
// ======================================================

import OpenAI from 'openai';

/**
 * @param {Object} config
 * @param {string} config.model - e.g. "gpt-4o", "llama-3-70b", "gemini-1.5-flash"
 * @param {Object} config.api_keys - { openai, groq, gemini }
 * @param {Object} config.cloudflare - { accountId, gatewayId, cfAIGToken }
 * @param {boolean} config.verbose - If true, logs raw request/response objects
 */
export class ChatLLM {
  constructor(config = {}) {
    this.config = config;
    this.model = config.model || 'gpt-4o-mini';
    this.temperature = config.temperature || 0.7;
    this.verbose = config.verbose || false;
    this.logger = config.logger; // Injected Logger instance

    // Helper to detect provider based on model name
    this.provider = this._detectProvider(this.model);
  }

  /**
   * Identifies the provider (openai, groq, gemini) based on the model string.
   */
  _detectProvider(model) {
    if (!model) return 'openai'; // Safety check
    if (model.includes('llama') || model.includes(`oss`) || model.includes('mixtral')) return 'groq';
    if (model.includes('gpt') || model.includes('o1-')) return 'openai';
    if (model.includes('gemini')) return 'gemini';
    return 'openai'; // Default fallback
  }

  /**
   * Main Chat Interface
   * @param {Array} messages - Array of { role, content } objects
   * @param {Object} options - { tools: [], toolChoice: 'auto' }
   */
  async chat(messages, options = {}) {
    // 1. Initialize State Trackers (for debugging crash locations)
    let currentStep = "INIT";
    let baseURL = "NOT_SET";
    let endpointType = "NOT_SET";

    try {
      // --- CHECKPOINT: VALIDATION ---
      currentStep = "VALIDATING_CONFIG";

      // Ensure we have either API keys OR a Cloudflare Token
      const hasDirectKeys = this.config.api_keys && Object.keys(this.config.api_keys).length > 0;
      const hasCFToken = this.config.cloudflare?.cfAIGToken;

      if (!hasDirectKeys && !hasCFToken) {
        throw new Error("Missing configuration: Provide 'api_keys' or 'cloudflare.cfAIGToken'.");
      }

      let apiKey = this.config.api_keys?.[this.provider];

      // --- CHECKPOINT: ROUTING ---
      currentStep = "DETERMINING_ENDPOINT";

      // CASE A: CLOUDFLARE AI GATEWAY (Universal Endpoint)
      if (this.config.cloudflare?.accountId && this.config.cloudflare?.gatewayId && this.config.cloudflare?.cfAIGToken) {
        const { accountId, gatewayId } = this.config.cloudflare;

        // CF Gateway requires "google-ai-studio" (or "google") for the provider path
        if (this.provider === "gemini") {
          this.provider = "google-ai-studio";
        }

        apiKey = this.config.cloudflare.cfAIGToken;

        // Use the 'universal' compatible endpoint
        baseURL = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`;
        endpointType = "CLOUDFLARE_GATEWAY";

        // Prepend provider to model name for the Universal Endpoint (e.g. "google/gemini-1.5-flash")
        if (!this.model.startsWith(this.provider + "/")) {
          this.model = `${this.provider}/${this.model}`;
        }
      }
      // CASE B: DIRECT CONNECTIONS
      else {
        if (!apiKey) throw new Error(`Missing API Key for provider: '${this.provider}'`);

        if (this.provider === 'gemini') {
          baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
          endpointType = "DIRECT_GEMINI";
        } else if (this.provider === 'groq') {
          baseURL = 'https://api.groq.com/openai/v1';
          endpointType = "DIRECT_GROQ";
        } else {
          baseURL = 'https://api.openai.com/v1';
          endpointType = "DIRECT_OPENAI";
        }
      }

      // --- CHECKPOINT: CLIENT INIT ---
      currentStep = "INITIALIZING_CLIENT";
      const client = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL
      });

      // --- CHECKPOINT: PAYLOAD BUILD ---
      currentStep = "PREPARING_PAYLOAD";
      const payload = {
        model: this.model,
        messages: messages,
        temperature: this.temperature,
      };

      if (options.tools && options.tools.length > 0) {
        payload.tools = options.tools;
        payload.tool_choice = options.toolChoice || 'auto';
      }

      // 1. Log START
      if (this.logger) this.logger.llmStart("Main", this.model);
      if (this.logger) this.logger.llmPayload(payload);

      // --- CHECKPOINT: API EXECUTION ---
      currentStep = "EXECUTING_API_CALL";
      let completion;

      // We do NOT catch here to swallow errors. We let errors bubble up to the 
      // MAIN catch block below, which contains the Self-Healing logic.
      const startTime = Date.now();
      completion = await client.chat.completions.create(payload);

      const duration = Date.now() - startTime;

      // 2. Log RESPONSE
      if (this.logger) this.logger.llmResponse(completion);

      // --- CHECKPOINT: RESPONSE VALIDATION ---
      currentStep = "VALIDATING_RESPONSE";
      if (!completion || !completion.choices || completion.choices.length === 0) {
        throw new Error("API returned invalid empty response.");
      }

      const message = completion.choices[0].message;
      const usage = completion.usage || {};

      // Log END stats
      if (this.logger) {
        this.logger.llmEnd("Main", { usage, duration }, null);
      }

      // --- CHECKPOINT: PARSING RESULTS ---
      currentStep = "PARSING_RESULT";
      let finalResult;

      // Case A: Tool Call
      if (message.tool_calls && message.tool_calls.length > 0) {
        currentStep = "PARSING_TOOL_ARGUMENTS";

        const toolCalls = message.tool_calls.map((tc, index) => {
          try {
            return {
              id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`, // Safety ID for Gemini
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            };
          } catch (jsonErr) {
            if (this.logger) this.logger.error("ChatLLM", `JSON Parse Error in Tool #${index} (${tc.function.name})`);
            throw new Error(`Failed to parse arguments: ${jsonErr.message}`);
          }
        });

        finalResult = {
          type: 'TOOL_CALL',
          rawMessage: message,
          toolCalls,
          usage,
        };
      }
      // Case B: Regular Text
      else {
        finalResult = {
          type: 'TEXT',
          rawMessage: message,
          text: message.content || "",
          usage,
        };
      }

      return finalResult;

    } catch (err) {
      // =========================================================
      // 🛠️ SELF-HEALING LOGIC FOR GEMINI ERRORS
      // =========================================================

      // 1. Check if we have the specific "tool_use_failed" signature
      const isToolError =
        err.code === 'tool_use_failed' ||
        (err.error && err.error.code === 'tool_use_failed') ||
        (err.message && err.message.includes('tool_use_failed')) ||
        (err.status === 400 && JSON.stringify(err).includes('tool_use_failed'));

      const failedGen =
        err.failed_generation ||
        (err.error && err.error.failed_generation) ||
        (err.response?.data?.error?.failed_generation) ||
        (err.error?.failed_generation);

      if (isToolError && failedGen) {
        if (this.logger) {
          this.logger.error("ChatLLM", "failed gen response recieved, self healing initiiated");
        }
        if (this.verbose) console.warn(`[ChatLLM] ⚠️ Caught Gemini Tool Error. Attempting Self-Heal...`);

        let toolName, args;

        // 1. Try parsing failed_generation as JSON directly
        try {
          const parsed = JSON.parse(failedGen);
          toolName = parsed.name;
          args = parsed.arguments;
          if (typeof args === 'string') {
            // Sometimes arguments is a string that needs parsing again, or it's just a string value
            try { args = JSON.parse(args); } catch (e) { }
          }
        } catch (e) {
          // JSON Parse failed, fall through to Regex
        }

        // 2. Regex fallback for <function=NAME({"arg": "val"}) format
        if (!toolName) {
          const regex = /<function=(\w+)\((.*)\)/;
          const match = failedGen.match(regex);
          if (match) {
            try {
              toolName = match[1];
              args = JSON.parse(match[2]);
            } catch (e) {
              // If JSON.parse fails, it might be a raw string
              args = match[2];
            }
          }
        }

        // 3. Regex fallback for malformed JSON (Missing quotes issue)
        // Payload: {"name": "SRS", "arguments": Nova OpenStack technical details"}
        if (!toolName) {
          const nameMatch = failedGen.match(/"name":\s*"([^"]+)"/);
          const argsMatch = failedGen.match(/"arguments":\s*(?:")?([^"}]+)(?:")?\s*}/);

          if (nameMatch && argsMatch) {
            toolName = nameMatch[1];
            // Heuristic: If it looks like a string argument but failed JSON parse, use it as raw string
            // Note: This assumes single argument tools primarily or simple string args
            // argsMatch[1] captures the content. We'll wrap it in a default object structure if we can guess the key, 
            // but since we don't know the key, we might have to pass it as a raw object if the tool accepts it,
            // OR we try to infer. 
            // HOWEVER, the error specifically showed "arguments": ... so it might be a single arg map.

            // For safety, let's treat the captured string as the value for "input" or "query" if we can't parse it,
            // BUT for now, let's try to assume it's the raw value of the expected argument.
            // Since we don't know the argument name (scheme not available here), 
            // we have to rely on the fact that if it was "arguments": ..., LLM meant it as a value.
            // Wait, if failedGen is `{"name": "SRS", "arguments": Nova...}`, then `arguments` IS the key.
            // The SRS tool expects { query: string }. 
            // The LLM effectively tried to pass the string directly to "arguments".
            // We'll map it to a generic "query" or "input" or just pass it as is if the tool can handle it?
            // Actually, let's look at the implementation plan again. 
            // verification plan said: Pattern: `"arguments":\s*(?:")?([^"}]+)(?:")?`

            // Let's coerce it into a valid object. 
            // Use a heuristic: SRS usually takes 'query'. Calculator might break.
            // But specifically for the error seen: code=tool_use_failed.

            // Lets try to return the raw string as 'query' if tool is SRS, otherwise put it in 'input'.
            const rawVal = argsMatch[1].trim();
            if (toolName === 'SRS' || toolName === 'SMS') {
              args = { query: rawVal };
            } else {
              args = { input: rawVal };
            }
          }
        }

        if (toolName && args) {
          if (this.verbose) console.log(`[ChatLLM] ✅ Self-Heal Success! Recovered tool: ${toolName}`);

          return {
            type: 'TOOL_CALL',
            rawMessage: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: `call_rescued_${Date.now()}`,
                type: 'function',
                function: { name: toolName, arguments: JSON.stringify(args) }
              }]
            },
            toolCalls: [{
              id: `call_rescued_${Date.now()}`,
              name: toolName,
              args: args
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0 }
          };
        }
      }

      // =========================================================
      // STANDARD ERROR LOGGING
      // =========================================================
      if (this.logger) {
        this.logger.error("ChatLLM", `Critical Error in ${currentStep}`, err.stack);
        // Also log details if verbose
        if (this.verbose) {
          console.error(`🔌 Provider       : ${this.provider}`);
          console.error(`🌐 Endpoint Type  : ${endpointType}`);
          console.error(`🔗 Base URL       : ${baseURL}`);
        }
      }

      return {
        type: 'ERROR',
        error: err.message,
        stage: currentStep
      };
    }
  }
}