import { Logger } from './logger.js';
import { ChatLLM } from './llm.js';
import { PromptBuilder } from './prompt.js';
import { ContextManager } from './ctxManager.js';
import { ToolRegistry } from './toolRegistry.js';

export class Pipeline {
  /**
   * @param {Object} config - Pipeline configuration
   * @param {boolean} config.verbose - Enable verbose logging
   * @param {Object} config.ctxManagerConfig - Config for Context Manager
   * @param {Object} config.llmConfig - Config for ChatLLM
   * @param {Array} config.tools - Array of external tool definitions { name, description, schema, func }
   * @param {number} config.maxToolLoop - Max iterations (default 6)
   */
  constructor(config = {}) {
    this.config = config;
    this._maxToolLoop = config.maxToolLoop || 6;

    // 0. Initialize Logger
    this.logger = new Logger(config.verbose || false);

    // 1. Initialize Components
    this.ctx = new ContextManager({ ...config.ctxManagerConfig, logger: this.logger });
    this.llm = new ChatLLM({ ...config.llmConfig, logger: this.logger, verbose: config.verbose });
    this.registry = new ToolRegistry({ logger: this.logger });
    this.promptBuilder = new PromptBuilder(config.promptBuilderConfig);

    // 2. Register Internal Tools (SMS/SRS)
    this.ctx.initializeTools(this.registry);

    // 3. Register External/Developer Tools
    if (Array.isArray(config.tools)) {
      for (const t of config.tools) {
        this.registry.register(t.name, t.description, t.schema, t.func);
      }
    }
  }

  /**
   * Runs the agent pipeline.
   * @param {string} userPrompt - The user's input text.
   * @returns {Promise<string>} The final text response from the agent.
   */
  async run(userPrompt) {
    this.logger.startPipeline(userPrompt);

    try {
      // 1. Load History (Context)
      const history = await this.ctx.getHistory();

      // 2. Build System Prompt
      const { system } = await this.promptBuilder.build();

      // 3. Prepare Message Chain
      const messages = [
        { role: 'system', content: system },
        ...history,
        { role: 'user', content: userPrompt }
      ];

      // Keep track of new messages generated in this session to save later
      const newSessionMessages = [{ role: 'user', content: userPrompt }];

      let loops = 0;
      let finalOutput = "";

      // ==========================================
      // 🔄 The Tool Execution Loop
      // ==========================================
      while (loops < this._maxToolLoop) {
        loops++;
        this.logger.loopStart(loops);

        // A. Call LLM with Tools
        const response = await this.llm.chat(messages, {
          tools: this.registry.getAPITools(),
          toolChoice: 'auto'
        });

        // B. Handle Error
        if (response.error) {
          throw new Error(`LLM Error: ${response.error}`);
        }

        // C. Push Assistant Response to Memory & Chain
        messages.push(response.rawMessage);
        newSessionMessages.push(response.rawMessage);

        // D. CASE: Text Response (Final Answer)
        if (response.type === 'TEXT') {
          finalOutput = response.text;
          break; // Exit loop
        }

        // E. CASE: Tool Call
        if (response.type === 'TOOL_CALL') {
          // Execute all tools requested by the LLM in parallel
          const toolResults = await Promise.all(
            response.toolCalls.map(async (call) => {

              // Execute via Registry
              const result = await this.registry.execute(call.name, call.args);

              // Construct Tool Message (OpenAI Standard)
              return {
                role: 'tool',
                tool_call_id: call.id, // Critical: Links result to the specific call
                name: call.name,
                content: result
              };
            })
          );

          // Append results to chain
          messages.push(...toolResults);
          newSessionMessages.push(...toolResults);
        }

        this.logger.loopEnd(loops);
      }

      // 4. Save Session to Memory
      await this.ctx.save(newSessionMessages);

      this.logger.endPipeline();
      return finalOutput;

    } catch (err) {
      this.logger.error("Pipeline", err.message, err.stack);
      throw err;
    }
  }
}