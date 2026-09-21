import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectEditorPolicy, proposePolicyChange, serializePolicy, OPERATIONS } from '../dist/index.js';
import { context, freshContext, policy } from './fixtures/context.mjs';

for (const operation of OPERATIONS) {
  test(`controlled ${operation} change returns a complete new value, without mutating either input`, () => {
    const original = policy(operation);
    const candidate = { ...original, select: [{ kind: 'field', field: 'id' }, { kind: 'field', field: 'email' }] };
    const before = JSON.stringify([original, candidate, context]);
    const result = proposePolicyChange(original, candidate, context, 'User', operation, false);
    assert.equal(result.ok, true);
    assert.equal(JSON.stringify([original, candidate, context]), before);
    assert.notEqual(result.value, candidate);
    assert.notEqual(result.value.select, candidate.select);
    assert.equal(serializePolicy(result.value, context), serializePolicy(candidate, context));
    assert.deepEqual(original.select, [{ kind: 'field', field: 'id' }]);
  });
}

test('read-only changes refuse without yielding a replacement', () => {
  const current = policy();
  const next = { ...current, skip: true };
  const result = proposePolicyChange(current, next, context, 'User', 'findMany', true);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'readonly');
  assert.equal('value' in result, false);
});

test('invalid input is refused, not replaced with a valid candidate', () => {
  const result = proposePolicyChange({ unexpected: true }, policy(), context, 'User', 'findMany', false);
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
});

test('identity changes require new matching policy rather than silent resets', () => {
  assert.equal(inspectEditorPolicy(policy(), context, 'Post', 'findMany').ok, false);
  assert.equal(inspectEditorPolicy(policy(), context, 'User', 'delete').ok, false);
  assert.equal(proposePolicyChange(policy(), policy('findMany', 'Post'), context, 'User', 'findMany', false).ok, false);
});

test('changed capabilities refuse stale selection', () => {
  const fresh = freshContext();
  fresh.capabilities.models.find(model => model.model === 'User').select = ['email'];
  const result = inspectEditorPolicy(policy(), fresh, 'User', 'findMany');
  assert.equal(result.ok, false);
  assert.match(result.issues[0].message, /Projection is not allowed/);
});

test('invalid intermediate changes keep the last valid value', () => {
  const current = policy();
  const result = proposePolicyChange(current, { ...current, select: [] }, context, 'User', 'findMany', false);
  assert.equal(result.ok, false);
  assert.equal(current.select.length, 1);
});

test('all editor-state helpers are pure and require no DOM or consumer callback', () => {
  const current = policy();
  const snapshot = JSON.stringify(current);
  for (let index = 0; index < 10; index++) {
    assert.equal(inspectEditorPolicy(current, context, 'User', 'findMany').ok, true);
    assert.equal(proposePolicyChange(current, { ...current, skip: true }, context, 'User', 'findMany', false).ok, true);
  }
  assert.equal(JSON.stringify(current), snapshot);
  assert.equal(current.skip, false);
});
