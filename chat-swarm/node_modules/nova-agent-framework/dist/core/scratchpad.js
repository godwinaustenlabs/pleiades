// ===============================
// File: scratchpad.js (renamed from scratcpad.js; refactored, commented)
// ===============================

/**
 * Module-level in-memory store for scratchpads.
 * Each entry is keyed by the combination of clientId + agentId.
 * Example key: "client123:agentABC"
 */
const _SCRATCH = new Map();

// Helper to generate consistent composite keys.
const _skey = (clientId, agentId) => `${clientId}:${agentId}`;

/**
 * Scratchpad provides temporary reasoning or "memory" storage
 * for a (clientId, agentId) pair.
 *
 * ✅ Config Vars:
 *  - clientId (string)
 *  - agentId (string)
 *  - useScratchpad (boolean)
 *
 * ✅ Runtime Vars:
 *  - scratchpadContent (string)
 *
 * Use `.build()` to retrieve the current state,
 * and `.save(content)` to update the scratchpad.
 *
 * Example:
 * ```js
 * const pad = new Scratchpad({ clientId: "u1", agentId: "bot", useScratchpad: true });
 * const state = pad.build(); // => { active: true, content: "..." }
 * pad.save("Updated reasoning context");
 * ```
 */
export class Scratchpad {
  /**
   * Create a new Scratchpad instance.
   *
   * @param {Object} config - Configuration for the scratchpad.
   * @param {string} config.clientId - Unique client/session identifier.
   * @param {string} config.agentId - Unique agent identifier.
   * @param {boolean} [config.useScratchpad=false] - Whether to enable the scratchpad.
   */
  constructor(config = {}) {
    this.clientId = config.clientId;
    this.agentId = config.agentId;
    this.useScratchpad = config.useScratchpad ?? false; // safer default
  }

  /**
   * Build the scratchpad object for use in prompts.
   *
   * @returns {{ active: boolean, content: string } | null}
   * Returns scratchpad state, or `null` if disabled.
   */
  build() {
    if (!this.useScratchpad) {
      // (Clutter) Could optionally log here for debugging: "Scratchpad disabled"
      return {
        active: this.useScratchpad,
        content: 'scratchpad disabled',
      };
    }

    const lastScratchpad = this._load(this.clientId, this.agentId);

    // Return structure even if no prior content.
    return {
      active: this.useScratchpad,
      content: lastScratchpad || '',
    };
  }

  /**
   * Load the most recent scratchpad content.
   *
   * @private
   * @returns {string|null} Previously stored scratchpad content, or null.
   */
  _load() {
    const k = _skey(this.clientId, this.agentId);
    return _SCRATCH.get(k) || null;
  }

  /**
   * Save scratchpad content to memory.
   *
   * @param {string} scratchpadContent - The reasoning text to persist.
   * @returns {void}
   */
  save(scratchpadContent) {
    // (Clutter) Currently ignores falsy values silently.
    // Could warn if attempting to save empty string.
    if (scratchpadContent) {
      const k = _skey(this.clientId, this.agentId);
      _SCRATCH.set(k, scratchpadContent);
    }
  }
}
