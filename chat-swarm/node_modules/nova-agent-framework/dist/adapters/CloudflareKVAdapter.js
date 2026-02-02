// ===============================
// File: adapters/CloudflareKVVectorAdapter.js
// ===============================

import fetch from 'node-fetch';

export default class CloudflareKVVectorAdapter {
  constructor(config = {}) {
    this.kv = config.kvNamespace;
    this.clientId = config.clientId;
    this.agentId = config.agentId;
  }

  _makeKey() {
    const inverted = Number.MAX_SAFE_INTEGER - Date.now();
    return `${this.agentId}:${this.clientId}:${inverted}`;
  }

  /**
   * Save to KV and Vectorize
   */
  async save(payload) {
    const timestamp = Date.now();
    const key = this._makeKey();
    const body = JSON.stringify({
      agentId: this.agentId,
      clientId: this.clientId,
      payload,
      timestamp,
    });

    // ---- KV store ----

    await this.kv.put(key, body);

    return { success: true, key };
  }

  /**
   * Load recent entries (short-term memory)
   */
  async load(lastN = 10) {
    const prefix = `${this.agentId}:${this.clientId}:`;
    const items = [];

    const list = await this.kv.list({ prefix, limit: lastN });
    for (const { name } of list.keys) {
      const val = await this.kv.get(name);
      if (val) items.push(JSON.parse(val));
    }

    return items.reverse();
  }
}
