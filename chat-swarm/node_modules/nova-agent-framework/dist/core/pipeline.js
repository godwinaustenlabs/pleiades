// ===============================
// File: pipeline.js (extended with ContextManager + SMS loop)
// ===============================

import { ChatLLM } from './llm.js';
import { PromptBuilder } from './prompt.js';
import { parseNAS } from './parser.js';
import { ContextManager } from './ctxmanager.js'; // <- new
// NOTE: memory.js and scratchpad.js are no longer constructed here directly

/**
 * Pipeline orchestrates the flow: context -> prompt -> LLM -> parse -> (optional SMS/SRS loop) -> save -> output
 */
export class Pipeline {
  constructor(config = {}, outputType) {
    this.config = { ...config };
    this.outputType = outputType || 'parsed';
    // Safety cap for tool loops to prevent runaway loops
    this._maxToolLoop = Number(config.maxToolLoop || 6);
  }

  async run() {
    // 0) Create Context Manager
    const ctx = new ContextManager({ ...(this.config.ctxManagerConfig || {}) });

    // 1) PromptBuilder - initialize with base systemPrompt + tools from config (will be augmented with context tools)
    const promptBuilder = new PromptBuilder({
      ...(this.config.promptBuilderConfig || {}),
      lastToolResponse: this.config.lastToolResponse || null,
    });

    // 2) LLM
    const llm = new ChatLLM({ ...this.config.llmConfig });

    //End of Configuration

    // We will iterate: build prompt -> LLM -> parse -> if toolRequest is SMS/SRS => fetch -> loop
    let lastParsed = null;
    let lastLLMRaw = null;
    let lastToolResponse = null;

    // 1) Load context (memory + scratchpad + optionally preloaded RAG)
    const context = await ctx.load();
    // context: { memory, scratchpad, rag, tokensUsedByMemory, tools? }

    // Merge context tools into promptBuilder dynamically
    // Context Manager may provide default tool metadata (SMS / SRS)
    promptBuilder.tools = {
      ...(promptBuilder.tools || {}),
      ...(context.tools || {}),
    };

    // Build initial prompt
    let built = await promptBuilder.build(
      this.config.userPrompt,
      context.memory,
      context.scratchpad,
      context.rag
    );

    // Track loop count
    let loopCount = 0;
    let shouldContinue = true;
    let COTOutput = {}; // Chain of Thought output object to return

    while (shouldContinue) {
      loopCount++;
      if (loopCount > this._maxToolLoop) {
        throw new Error(
          `Tool request loop exceeded max iterations (${this._maxToolLoop}). Aborting.`
        );
      }

      // 4) Decide what to send: userPrompt (first round) OR lastToolResponse (after tool)
      if (lastToolResponse) {
        // Mark: only send the tool response forward, not the same user input again
        promptBuilder.lastToolResponse = lastToolResponse;
        built = await promptBuilder.build(
          '', // suppress repeating original user input
          context.memory,
          COTOutput.scratchpad
        );
      }

      const response = await llm.chat(built, {});
      lastLLMRaw = response;
      // 5) Parse JSON output
      const parsed = { ...parseNAS(response.text) };
      lastParsed = parsed;

      // If the LLM asked to call SMS / SRS (semantic search tools), call context.fetch and loop
      const tr = parsed.toolRequest;
      const isSMS =
        tr &&
        typeof tr.name === 'string' &&
        ['SMS', 'SRS', 'sms', 'srs'].includes(String(tr.name).toUpperCase());

      if (isSMS) {
        //call to semantic builders
        // Call ContextManager.fetch with the args from toolRequest
        const fetchArgs = tr.args || {};
        const fetchResult = await ctx.fetch({
          name: String(tr.name).toUpperCase(),
          args: fetchArgs,
        });

        // fetchResult expected to contain the same structure as save() return:
        // { tokensUsedByMemory, snapshot, tools, rag, ... }
        // We'll set lastToolResponse and also merge new tools into promptBuilder
        lastToolResponse = fetchResult;

        // Also if fetchResult.snapshot exists we should update the local context.memory snapshot (for transparency)
        if (fetchResult.snapshot) {
          context.memory = fetchResult.snapshot;
        }

        // Rebuild prompt with new context + lastToolResponse
        // built = await promptBuilder.build(
        //   this.config.userPrompt,
        //   context.memory,
        //   lastParsed.scratchpad, // inject RAG results if any
        // );

        // Build final return object consistent with previous pipeline
        COTOutput = {
          ...lastParsed,
          LLMUsage: lastLLMRaw.usage,
          ...(context.tokensUsedByMemory || null),
          memory: context.memory,
        };


        // continue loop (do not save yet). The LLM will receive lastToolResponse in the next call.
        continue;
      }

      // If not SMS, stop looping and proceed to save and finalization
      shouldContinue = false;

      // 6) Save scratchpad + memory via ContextManager.save
      // Save expects turn (conversation pair) and optional scratchpad content.
      // We'll attempt to compute the assistant content from parsed.content
      const assistantContent = parsed.content || parsed.finalAnswer || '';
      // turn to persist
      const turn = [
        { role: 'user', content: this.config.userPrompt },
        { role: 'assistant', content: assistantContent },
      ];

      // Save via ContextManager, returns tokens info, snapshot, and tools
      const saveResult = await ctx.save(
        turn,
        typeof parsed.scratchpad === 'string'
          ? parsed.scratchpad
          : (parsed.scratchpad?.content ?? '')
      );

      // If saveResult.tools, merge them (so the user can use them next time)
      if (saveResult.tools) {
        promptBuilder.tools = {
          ...(promptBuilder.tools || {}),
          ...saveResult.tools,
        };
      }

      // If parsed.toolRequest exists and it's not SMS, allow external toolRunner if provided (legacy behavior)
      if (parsed.toolRequest && this.config.toolRunner) {
        const toolRes = await this.config.toolRunner(
          parsed.toolRequest.name,
          parsed.toolRequest.args
        );
        parsed.toolResponse = toolRes;
      }

      // Prepare snapshot after save
      const snapshot = saveResult.snapshot || (await ctx.memory.load()).data;

      // Build final return object consistent with previous pipeline
      const outputObj = {
        ...parsed,
        LLMUsage: lastLLMRaw.usage,
        ...(saveResult.tokensUsedByMemory || null),
        ...snapshot,
      };

      // Return according to requested outputType
      if (this.outputType.toLowerCase() === 'text') {
        return lastLLMRaw.text;
      }
      if (this.outputType.toLowerCase() === 'raw') {
        return lastLLMRaw.raw || lastLLMRaw;
      }
      if (this.outputType.toLowerCase() === 'parsed') {
        return outputObj;
      }
    }
  }
}
