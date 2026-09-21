import type { GuardPolicy, Operation, PolicyContext, ValidationResult } from './types.js';
import { validatePolicy } from './policy.js';

export function inspectEditorPolicy(input: unknown, context: PolicyContext, model: string, operation: Operation): ValidationResult<GuardPolicy> {
  const result = validatePolicy(input, context);
  if (!result.ok) return result;
  if (result.value.model !== model || result.value.operation !== operation) {
    return { ok: false, issues: [{ path: '$', code: 'identity', message: 'The supplied policy does not match the selected model and operation. The consumer must supply a matching policy.' }] };
  }
  return result;
}

export function proposePolicyChange(input: unknown, candidate: unknown, context: PolicyContext, model: string, operation: Operation, readOnly: boolean): ValidationResult<GuardPolicy> {
  const current = inspectEditorPolicy(input, context, model, operation);
  if (!current.ok) return current;
  if (readOnly) return { ok: false, issues: [{ path: '$', code: 'readonly', message: 'The policy is read-only.' }] };
  return inspectEditorPolicy(candidate, context, model, operation);
}
