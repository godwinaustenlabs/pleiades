// ===============================
// File: NASValidation.js (light touch, commented)
// ===============================
import { validateNASInput, validateNASOutput } from '../utils/validateNAS.js';

/**
 * Wraps an agent or tool logic function with NAS input/output validation
 * Works for both Agents and Tools
 */
export function withNASValidation(requestBody, logicFn) {
  return async function () {
    const id = requestBody?.agent_id || requestBody?.id || 'unknown';

    // 1) Validate NAS Input
    const inCheck = validateNASInput(requestBody);
    if (!inCheck.valid) {
      return {
        status: 'error',
        id,
        error: {
          code: 'INVALID_INPUT',
          message: inCheck.errors,
        },
      };
    }

    // 2) Run the logic
    let output;
    try {
      output = await logicFn(requestBody);
    } catch (err) {
      return {
        status: 'error',
        id,
        error: {
          code: 'LOGIC_ERROR',
          message: err?.message || 'Unknown error in logic',
        },
      };
    }

    // 3) Validate NAS Output
    const outCheck = validateNASOutput(output);
    if (!outCheck.valid) {
      return {
        status: 'error',
        id: output?.agent_id || output?.id || id,
        error: {
          code: 'INVALID_OUTPUT',
          message: outCheck.errors,
        },
      };
    }

    return output;
  };
}
