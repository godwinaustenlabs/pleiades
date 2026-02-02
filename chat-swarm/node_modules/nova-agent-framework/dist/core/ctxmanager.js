// ===============================
// File: ctxManager.js
// Purpose: Manages context across memory, scratchpad, and RAG pipelines.
// ===============================

import { Memory } from './memory.js';
import { Scratchpad } from './scratchpad.js';
import { srs } from './rag.js';

/**
 * ContextManager
 * Handles short-term (scratchpad) and long-term (memory) contexts.
 * Provides RAG (retrieval-augmented generation) integration with pipelines.
 */
export class ContextManager {
  /**
   * @param {Object} config - Configuration object for context management.
   * @param {string} config.clientId - ID of the client interacting with the system.
   * @param {string} config.agentId - ID of the AI agent managing the session.
   * @param {string} config.memoryType - Type of memory system (e.g., "vector", "text").
   * @param {number} config.limitTurns - Max number of conversation turns to retain.
   * @param {Object} config.summarizer - Object containing vars to configure summarizer past context.
   * @param {string} config.provider - LLM provider name (Groq, OpenAI, Gemini, etc.).
   * @param {Objeect} config.api_keys - Provider API keys.
   * @param {string} config.model - LLM model to use for context or RAG.
   * @param {Object} config.env - Cloudflare Worker environment (LLM keys, model, etc.).
   * @param {Object} config.pipelines - RAG pipelines (map of bindings + descriptions).
   * @param {string} config.ragProvider - Name of RAG provider if used.
   * @param {Object} config.cloudflare - Optional Cloudflare binding for Gateway usage.
   */
  constructor(config = {}) {
    // Store full config for reference
    this.config = { ...config };

    // Initialize Memory (long-term or persistent)
    this.memory = new Memory({ ...config.memory });

    // Initialize Scratchpad (short-term context)
    this.scratchpad = new Scratchpad({ ...config.scratchpad });

    // RAG precontext (optional)
    this.ragPrecontext = config.ragPrecontext;

    // Default tool definitions for dynamic routing/fetch
    this.defaultTools = {
      SMS: {
        description: 'Semantic Memory Search (long-term) to reference past conversations. Only takes one word query',
        params: { query: 'string'},
      },
      SRS: {
        description:
          'Semantic RAG Search (To search smh from external knowledge base).',
        params: { query: 'string'},
      },
    };
  }

  /**
   * Loads the memory, scratchpad, and RAG context into a unified object.
   * @returns {Promise<Object>} Aggregated context for prompt assembly.
   */
  async load() {
    const mem = await this.memory.load();
    const scratchpad = this.scratchpad.build().content;

    return {
      memory: mem.data,
      scratchpad,
      rag: this.ragPrecontext || null,
      tokensUsedByMemory: mem.tokensUsedByMemory || null,
      tools: { ...this.defaultTools },
    };
  }

  /**
   * Saves the current turn data into memory and optionally updates scratchpad.
   * @param {Object} turn - The user/assistant interaction turn to save.
   * @param {string|null} [scratchpadContent=null] - Optional scratchpad text to store.
   * @returns {Promise<Object>} Snapshot of updated memory and token usage.
   */
  async save(turn, scratchpadContent = null) {
    if (scratchpadContent) this.scratchpad.save(scratchpadContent);
    const tokensUsedByMemory = await this.memory.save(turn);
    const snapshot = (await this.memory.load()).data;
    return { tokensUsedByMemory, snapshot, tools: { ...this.defaultTools } };
  }

  /**
   * Fetches results using either SMS (memory) or SRS (RAG) tool.
   * @param {Object|string} request - Request object or tool name string.
   * @param {string} request.name - Tool name ("SMS" or "SRS").
   * @param {Object} request.args - Arguments for the selected tool.
   * @returns {Promise<*>} Result of the memory or RAG search.
   */
  async fetch(request) {
    let { name, args } =
      typeof request === 'object' ? request : { name: request };
    name = String(name).toUpperCase();
    args = args || {};

    // Handle Semantic Memory Search
    if (name === 'SMS') {
      return this.memory.sms(
        args.query || '',
        Number(args.topK || 5),
        args.source || 'both'
      );
    }

    // Handle Semantic RAG Search
    if (name === 'SRS') {
      const result = await srs({ query: args.query, ...this.config.srs });
      return result.answer;
    }

    throw new Error(`[CM] Unknown fetch tool: ${name}`);
  }
}
