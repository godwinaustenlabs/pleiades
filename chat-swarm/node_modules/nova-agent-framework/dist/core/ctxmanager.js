// ===============================
// File: ctxManager.js
// Purpose: Manages context and registers internal tools (SMS/SRS) to the Registry.
// ===============================

import { Memory } from './memory.js';
import { Scratchpad } from './scratchpad.js'; // Optional if still using scratchpad for notes
import { srs } from './rag.js';
import { z } from 'zod';

export class ContextManager {
  /**
   * @param {Object} config
   * @param {string} config.clientId - Client ID.
   * @param {string} config.agentId - Agent ID.
   * @param {Object} config.memory - Memory configuration.
   * @param {Object} config.srs - RAG configuration.
   */
  constructor(config = {}) {
    this.config = { ...config };

    this.logger = config.logger;

    // Initialize Memory
    this.memory = new Memory({
      ...config.memory,
      clientId: config.clientId,
      agentId: config.agentId,
      logger: this.logger
    });

    // Optional Scratchpad (retained if you want non-tool notes)
    this.scratchpad = new Scratchpad({ ...config.scratchpad });
  }

  /**
   * Registers Internal Tools (SMS/SRS) into the provided Registry.
   * @param {ToolRegistry} registry - The pipeline's tool registry.
   */
  initializeTools(registry) {
    // 1. Semantic Memory Search (SMS)
    registry.register(
      "SMS",
      "Semantic Memory Search: Search the agent's long-term memory for past conversations.  (internal tool don't mention to user)",
      z.object({
        query: z.string().describe("1 key keyword to search for in memory."),
        topK: z.number().optional().describe("Number of results to return (default 5).")
      }),
      async ({ query, topK }) => {
        return await this.memory.sms(query, topK || 5);
      }
    );

    // 2. Semantic RAG Search (SRS)
    registry.register(
      "SRS",
      "Semantic RAG Search: Search the external knowledge base/documents. (internal tool don't mention to user)",
      z.object({
        query: z.string().describe("The query to search in the knowledge base.")
      }),
      async ({ query }) => {
        // Assuming srs returns { answer: "...", sources: [...] }
        const result = await srs({ query, ...this.config.srs, logger: this.logger });
        return result;
      }
    );
  }

  /**
   * Retrieves the full conversation history from Memory.
   * @returns {Promise<Array>} Array of message objects { role, content, ... }
   */
  async getHistory() {
    const memData = await this.memory.load();
    // Return just the turns array
    return memData.data?.turns || [];
  }

  /**
   * Saves a batch of messages to memory (User + Assistant + Tools).
   * @param {Array} newMessages - Array of new message objects to append.
   */
  async save(newMessages) {
    // Save batch of messages at once
    await this.memory.save(newMessages);
  }
}