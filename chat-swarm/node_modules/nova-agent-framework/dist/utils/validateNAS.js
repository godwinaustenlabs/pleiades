// ===============================
// File: validateNAS.js
// AJV-based NAS input/output validators
// ===============================

import Ajv from 'ajv';
import nasInputSchema from '../nas_schemas/nas-input.schema.json' with { type: 'json' };
import nasOutputSchema from '../nas_schemas/nas-output.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false });

const validateInput = ajv.compile(nasInputSchema);
const validateOutput = ajv.compile(nasOutputSchema);

export function validateNASInput(data) {
  const valid = validateInput(data);
  return valid
    ? { valid: true }
    : {
        valid: false,
        errors: ajv.errorsText(validateInput.errors, { separator: '\n' }),
      };
}

export function validateNASOutput(data) {
  const valid = validateOutput(data);
  return valid
    ? { valid: true }
    : {
        valid: false,
        errors: ajv.errorsText(validateOutput.errors, { separator: '\n' }),
      };
}
