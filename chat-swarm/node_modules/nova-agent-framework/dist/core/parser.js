// ======================================================
// File: parser.js
// Purpose: Parse and validate NAS JSON output from an LLM.
// ======================================================

/**
 * ✅ Purpose:
 *   Safely parses JSON returned from an LLM and validates it conforms to NAS schema.
 *   Ensures consistent shape for downstream processes.
 *
 * @param {string} output
 *   Raw JSON string returned by the LLM (use `.text` from llm output).
 *
 * @returns {{
 *    content: string,
 *    type: "NAS_OUTPUT",
 *    scratchpad: Object|null,
 *    toolRequest: Object|null,
 *    finalAnswer: string|null,
 *    meta: Object|null
 * }} Normalized NAS result.
 *
 * @throws {Error}
 *   If JSON parsing fails or schema does not match expected NAS structure.
 */
export function parseNAS(output) {
  let data;

  try {
    // Attempt to parse JSON as-is
    data = JSON.parse(output);
  } catch (err) {
    // Parsing failed — attempt to recover or format error output for debugging
    let formatted;

    try {
      // Attempt parsing again after stripping newlines
      formatted = JSON.stringify(
        JSON.parse(output.replace(/\n/g, '')),
        null,
        2
      );
    } catch {
      // Still failed — fallback to raw output
      formatted = output;
    }

    // Throw with detailed context for debugging
    throw new Error(
      `Invalid NAS JSON output from LLM.\n\nRaw output:\n${formatted}`
    );
  }

  // Validate NAS schema structure
  if (!data || typeof data !== 'object' || data.type !== 'NAS_OUTPUT') {
    throw new Error(
      `Missing or invalid NAS output structure.\n\nParsed:\n${JSON.stringify(
        data,
        null,
        2
      )}`
    );
  }

  // Return normalized NAS object
  return {
    content: data.content || '',
    type: data.type,
    scratchpad: data.scratchpad || null,
    toolRequest: data.toolRequest || null,
    finalAnswer: data.finalAnswer || null,
    meta: data.meta || null,
  };
}

export async function parseRAW(output) {
  var data;

  try {
    // Extract output from OpenAI-like responses.
    if (output?.choices?.[0]?.message?.content) {
      data = (output?.choices[0].message?.content || '').trim();

      return data;
    }
    // Extract output from Gemini-like responses.
    else if (output?.candidates?.[0]?.content?.parts?.[0]?.text) {
      data = (output?.candidates[0].content.parts[0].text || '')
        .trim()
        .split(/\s+/)[0];
      return data;
    }
  } catch (err) {}
}
