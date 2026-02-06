// ======================================================
// File: memory.js
// Purpose: Memory Manager with pluggable NAS adapters (e.g. Cloudflare KV)
// Supports buffer, summary, and dynamic memory strategies
// ======================================================

import { ChatLLM } from './llm.js';
import CloudflareKVAdapter from '../adapters/CloudflareKVAdapter.js';
import { parseRAW } from './parser.js';

// ======================================================
// In-memory stores (local runtime caches)
// ======================================================
const _RAM = new Map(); // Active conversational memory per client-agent
const _BaseStore = new Map(); // Long-term memory history (before KV persistence)
const _key = (client_id, agent_id) => `${client_id}:${agent_id}`;

// Utility: Estimate tokens based on rough char count
const estimateTokensLocal = (str = '', estCharsPerToken = 4) => {
  const est = Number(estCharsPerToken) || 4;
  return Math.ceil(String(str).length / est);
};

// ======================================================
// 🔌 Adapter Wrapper (NAS abstraction layer)
// ======================================================
class AdapterWrapper {
  constructor(config = {}) {
    this.agentId = config.agentId;
    this.clientId = config.clientId;
    this.adapter = new CloudflareKVAdapter(config);
  }

  /**
   * Save payload to external NAS adapter (e.g. Cloudflare KV)
   * @param {object} payload - Data to persist (turns + summary)
   */
  async saveNAS(payload) {
    if (!this.adapter?.save) return;
    try {
      await this.adapter.save(payload);
    } catch (err) {
      console.error(
        `[AdapterWrapper] saveNAS failed: ${err.message}, Stack: ${err.stack}`
      );
    }
  }

  /**
   * Load recent conversation entries from NAS
   * @param {number} n - Number of entries to fetch
   */
  async loadNAS(n) {
    if (!this.adapter?.load) return null;
    try {
      return await this.adapter.load(100); // clutter: fixed hardcoded limit
    } catch (err) {
      console.error(`[AdapterWrapper] loadNAS failed: ${err.message}`);
      return null;
    }
  }
}

// ======================================================
// 🧩 Main Memory Manager
// ======================================================
export class Memory {
  /**
   * @param {object} config
   * @param {string} config.clientId
   * @param {string} config.agentId
   * @param {'buffer'|'summary'|'dynamic'} [config.memoryType]
   * @param {number} [config.limitTurns]
   * @param {object} [config.summarizer]
   * @param {string} [config.provider]
   * @param {string} [config.api_key]
   * @param {string} [config.model]
   * @param {object} [config.adapter]
   */
  constructor(config = {}) {
    this.clientId = config.clientId;
    this.agentId = config.agentId;
    this.memoryType = String(config.memoryType || 'buffer').toLowerCase();
    this.limitTurns = Number(config.limitTurns) || 10;
    this.summarizerCfg = {
      temperature: config.summarizer?.temperature || 0.7,
      maxOutputTokens: config.summarizer?.maxOutputTokens || 200,
      totalTokenBudget: config.summarizer?.totalTokenBudget || 712,
      reserveForOutput: config.summarizer?.reserveForOutput || 700,
      llmConfig: config.summarizer?.llmConfig || {},
    };
    this.kvNamespace = config.kvNamespace || null;
    this.logger = config.logger;

    // Wrap NAS adapter
    this.adapterWrapper = new AdapterWrapper({
      kvNamespace: this.kvNamespace,
      agentId: this.agentId,
      clientId: this.clientId,
      logger: this.logger
    });

    // Initialize memory strategy
    this.memory = this._initMemory(this.memoryType);
  }

  /**
   * Initialize selected memory strategy
   */
  _initMemory(type) {
    switch (type) {
      case 'nomemory':
        return new nomemory();
      case 'summary':
        return new SummaryMemory(this._summarizer.bind(this), this.limitTurns);
      case 'dynamic':
        return new DynamicMemory(
          this._summarizer.bind(this),
          this.summarizerCfg
        );
      case 'buffer':
      default:
        return new BufferMemory(this.limitTurns);
    }
  }

  /**
   * Internal summarizer using ChatLLM
   */
  async _summarizer() {
    const k = _key(this.clientId, this.agentId);
    const data = _RAM.get(k);
    const text = data.turns.map((t) => `[${t.role}] ${t.content}`).join('\n');
    const messages = [
      {
        role: 'system',
        content:
          'Summarize conversation concisely while preserving context and important details.',
      },
      {
        role: 'user',
        content: `Summarize this:\n${text}\n\nSummarize previous summary too: "${data.summary}"`,
      },
    ];

    const llm = new ChatLLM({ ...this.summarizerCfg.llmConfig });

    const res = await llm.chat({
      user: messages[1].content,
      system: messages[0].content,
    });

    data.summary = await parseRAW(res.raw);
    data.turns = data.turns.slice(-4);
    _RAM.set(k, data);
    return res;
  }

  /**
   * SMS Search Memory — search previous turns for a query
   * @param {string} query - Text to search
   * @param {number} topK - Number of top matches to return
   */
  async sms(query, topK) {
    const smsResults = [];
    if (query) {
      const k = _key(this.clientId, this.agentId);

      // CRITICAL FIX: Ensure memory is loaded before searching
      // This prevents 500 errors in stateless workers where _BaseStore starts empty
      if (!_BaseStore.has(k)) {
        await this.load();
      }

      let s = 1;
      let turns = _BaseStore.get(k)?.turns || [];

      for (const t of turns) {
        if (
          typeof t.content === 'string' &&
          t.content.toLowerCase().includes(query.toLowerCase())
        ) {
          smsResults.push({
            id: `mem:${Math.random().toString(36).slice(2, 9)}`,
            score: s,
            text: t.content,
            metadata: { role: t.role },
          });
          s = s + 1;
        }
      }
    }

    const Results = { SMS: smsResults.slice(0, topK) };
    return Results;
  }

  /**
   * Load memory into RAM (rehydrate from KV adapter if missing)
   */
  async load() {
    const k = _key(this.clientId, this.agentId);
    let data = _RAM.get(k);

    if (this.memory instanceof nomemory) {
      data = { turns: [], summary: '' };
      return { data: data, tokensUsedByMemory: null };
    }

    if (!data) {
      const extData = await this.adapterWrapper.loadNAS(6);
      if (extData && Array.isArray(extData)) {
        const merged = {
          turns: extData.flatMap((e) => e.payload?.turns || []),
          summary: extData.at(-1)?.payload?.summary || '',
        };
        _BaseStore.set(k, merged);
        const mem = _BaseStore.get(k);
        if (mem?.turns?.length) {
          const limitTurns = mem.turns.slice(-this.limitTurns);
          const RAM = { turns: limitTurns, summary: mem.summary || '' };
          _RAM.set(k, RAM);
          return { data: RAM, tokensUsedByMemory: null };
        }
      }
    }

    return { data: data, tokensUsedByMemory: null };
  }

  /**
   * Save a new conversational turn to memory + persist externally
   * @param {object} turn - Chat message { role, content }
   */
  async save(turn) {
    try {
      const k = _key(this.clientId, this.agentId);
      let tokensInfo = null;

      //No memory
      if (this.memory instanceof nomemory) {
        return;
      }

      // Handle different memory types
      if (this.memory instanceof DynamicMemory) {
        tokensInfo = await this.memory.saveAndMaybeSummarize(
          this.clientId,
          this.agentId,
          turn
        );
      } else if (typeof this.memory.summarizeIfNeeded === 'function') {
        tokensInfo = await this.memory.summarizeIfNeeded(
          this.clientId,
          this.agentId,
          turn
        );
      } else {
        await this.memory.save(this.clientId, this.agentId, turn);
      }

      // Persist to NAS adapter
      const mem = _RAM.get(k);
      // toPersist should be the exact new turns we just added, not a slice of history
      // This prevents duplicating overlaps when batch saving
      const turnsToSave = Array.isArray(turn) ? turn : [turn];
      const toPersist = { turns: turnsToSave, summary: mem.summary || '' };
      await this.adapterWrapper.saveNAS(toPersist);


      // Update base store (historical memory)
      const b = _key(this.clientId, this.agentId);
      if (!_BaseStore.has(b)) {
        _BaseStore.set(b, { turns: [], summary: '' });
      }

      if (Array.isArray(turn)) {
        _BaseStore.get(b).turns.push(...turn);
      } else {
        _BaseStore.get(b).turns.push(turn);
      }

      if (_BaseStore.get(b).turns.length > 100) {
        const slice = _BaseStore.get(b).turns.slice(-100);
        _BaseStore.set(b, { turns: slice, summary: _BaseStore.get(b).summary });
      }

      return {
        tokensUsedByMemory: tokensInfo?.tokensUsedByMemory || null,
        estimatedTokensUsed: tokensInfo?.estimatedTokensUsed || null,
      };
    } catch (err) {
      console.error(`[Memory] Save failed: ${err.message}, ${err.stack}`);
    }
  }
}

// No memory
export class nomemory {
  constructor() { }

  async load(clientId, agentId) {
    return { turns: [], summary: '' };
  }

  async save(clientId, agentId, turn) {
    return;
  }
}

// ======================================================
// 🧱 Memory Strategy Implementations
// ======================================================
export class BufferMemory {
  constructor(limitTurns) {
    this.limitTurns = limitTurns;
  }

  async load(clientId, agentId) {
    const k = _key(clientId, agentId);
    return _RAM.get(k) || { turns: [], summary: '' };
  }

  async save(clientId, agentId, turn) {
    const k = _key(clientId, agentId);
    const data = _RAM.get(k) || { turns: [], summary: '' };

    if (Array.isArray(turn)) data.turns.push(...turn);
    else if (turn) data.turns.push(turn);

    if (data.turns.length > this.limitTurns) {
      data.turns = data.turns.slice(-this.limitTurns);
    }
    _RAM.set(k, data);
    return data;
  }
}

// ======================================================
// 🧩 Summary Memory Strategy (auto-summarizes past turns)
// ======================================================
export class SummaryMemory extends BufferMemory {
  constructor(summarizer, limitTurns) {
    super(limitTurns);
    this.summarizer = summarizer;
  }

  async summarizeIfNeeded(clientId, agentId, turn) {
    await this.save(clientId, agentId, turn);

    const k = _key(clientId, agentId);
    const data = _RAM.get(k);
    if (!data || data.turns.length < this.limitTurns) return;

    const res = await this.summarizer();

    return {
      tokensUsedByMemory: {
        input: res.usage.prompt_tokens,
        output: res.usage.completion_tokens,
      },
      estimatedTokensUsageByMemory: null,
    };
  }
}

// ======================================================
// 🧮 Dynamic Memory (auto-manages token budget)
// ======================================================
export class DynamicMemory extends BufferMemory {
  constructor(summarizer, summarizerCfg) {
    super(500);
    this.memoryBudgetTokens =
      summarizerCfg.totalTokenBudget - summarizerCfg.reserveForOutput;
    this.summarizer = summarizer;
    this.maxOutputTokens = summarizerCfg.maxOutputTokens;
  }

  async saveAndMaybeSummarize(clientId, agentId, turn) {
    await this.save(clientId, agentId, turn);
    const context = await this.buildContextMessages(clientId, agentId);
    const approx = context.ExpectedUsedTokens;
    if (this.memoryBudgetTokens * 0.95 < approx) {
      const summarizerOutput = await this.summarizeIfNeeded(clientId, agentId);
      return {
        tokensUsedByMemory: summarizerOutput?.tokensUsedByMemory,
        estimatedTokensUsageByMemory: approx,
      };
    }
    return { tokensUsedByMemory: null, estimatedTokensUsageByMemory: approx };
  }

  async summarizeIfNeeded(clientId, agentId) {
    const k = _key(clientId, agentId);
    const data = _RAM.get(k);
    if (!data) return;
    const res = await this.summarizer();

    return {
      tokensUsedByMemory:
        {
          input: res.usage.prompt_tokens,
          output: res.usage.completion_tokens,
        } || null,
    };
  }

  async buildContextMessages(clientId, agentId) {
    const { turns, summary } = await this.load(clientId, agentId);
    const messages = [];
    let used = 0;

    if (summary) {
      messages.push({ role: 'system', content: `Memory Summary:\n${summary}` });
      used += estimateTokensLocal(summary);
    }

    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      const tokens = estimateTokensLocal(t.content);
      if (used + tokens > this.memoryBudgetTokens) break;
      messages.unshift({ role: t.role, content: t.content });
      used += tokens;
    }

    return { messages, ExpectedUsedTokens: used };
  }
}
