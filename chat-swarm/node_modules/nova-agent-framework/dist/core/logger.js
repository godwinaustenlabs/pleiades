// ===============================
// File: src/core/logger.js
// Purpose: Centralized, aesthetic logging system for Nova Framework
// ===============================

export class Logger {
    /**
     * @param {boolean} verbose - If true, logs deep debug info. If false, logs clean summary.
     */
    constructor(verbose = false) {
        this.verbose = verbose;
    }

    // ===============================
    // 🎨 Formatting Helpers
    // ===============================

    _box(title, char = "=") {
        console.log(char.repeat(60));
        console.log(`${title}`);
        console.log(char.repeat(60));
    }

    _line(char = "-") {
        console.log(char.repeat(60));
    }

    // ===============================
    // 🚀 Lifecycle Logs
    // ===============================

    startPipeline(userQuery) {
        this._box(`🤖 NOVA AGENT START | User: "${userQuery}"`);
    }

    endPipeline() {
        this._box(`✅ NOVA AGENT FINISHED`);
    }

    error(context, message, stack) {
        console.error(`\n❌ [${context}] ERROR: ${message}`);
        if (this.verbose && stack) {
            console.error(stack);
        }
    }

    // ===============================
    // 🧠 LLM Logs
    // ===============================

    llmStart(source, model) {
        console.log(`\n🤖 [LLM:${source}] Thinking... (Model: ${model})`);
    }

    /**
     * Logs LLM completion stats
     * @param {string} source - e.g. "Main", "Summarizer"
     * @param {Object} stats - { usage: { prompt_tokens, completion_tokens }, duration: number }
     * @param {string} [reasoning] - Optional reasoning trace
     */
    llmEnd(source, stats, reasoning) {
        const usage = stats.usage || {};
        const pt = usage.prompt_tokens || 0;
        const ct = usage.completion_tokens || 0;
        const time = stats.duration ? `${stats.duration}ms` : '';

        if (reasoning) {
            this._line("-");
            console.log(`🧠 [Reasoning]: ${reasoning}`);
            this._line("-");
        }

        console.log(`✨ [LLM:${source}] Response | In: ${pt} | Out: ${ct} | ${time}`);

        if (this.verbose) {
            // Verbose: Show raw stats object
            console.log(`   Detailed Stats:`, JSON.stringify(stats, null, 2));
        }
    }

    llmPayload(payload) {
        if (this.verbose) {
            console.log(`\n🔵 [LLM Payload]:`, JSON.stringify(payload, null, 2));
        }
    }

    llmResponse(response) {
        if (this.verbose) {
            console.log(`\n🟢 [LLM Raw Response]:`, JSON.stringify(response, null, 2));
        }
    }

    // ===============================
    // 🛠️ Tool Logs
    // ===============================

    toolStart(name, args) {
        console.log(`\n🛠️  [Tool:${name}] Executing...`);
        // "Clean" args log for minimal mode
        console.log(`    Args: ${JSON.stringify(args)}`);
    }

    toolEnd(name, result) {
        // Truncate long results in minimal mode
        let resStr = typeof result === 'string' ? result : JSON.stringify(result);
        if (!this.verbose && resStr.length > 200) {
            resStr = resStr.substring(0, 200) + "... (truncated)";
        }
        console.log(`    -> Result: ${resStr}`);
    }

    // ===============================
    // 💾 Memory / Context Logs
    // ===============================

    memory(action, details) {
        if (this.verbose) {
            console.log(`💾 [Memory:${action}] ${details}`);
        } else if (action === 'SAVE') {
            // Minimal log for saves
            console.log(`💾 [Memory] Saved context.`);
        }
    }

    // ===============================
    // 🔎 RAG Logs
    // ===============================

    ragSearch(query, pipeline) {
        console.log(`🔎 [RAG] Searching pipeline "${pipeline}" for: "${query}"`);
    }

    // ===============================
    // 🔄 Loop / Iteration Logs
    // ===============================

    loopStart(iteration) {
        this._line("=");
        console.log(`🔄 LOOP ${iteration} START`);
        this._line("=");
    }

    loopEnd(iteration) {
        console.log(`🔄 LOOP ${iteration} END`);
        this._line("-");
    }
}
