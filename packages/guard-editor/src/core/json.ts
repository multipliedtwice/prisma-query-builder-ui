import type { JsonValue, ValidationIssue, ValidationResult } from './types.js';

export const MAX_JSON_LENGTH = 262144;
const MAX_NODES = 20000;
const MAX_JSON_DEPTH = 64;
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);

export function refuse(path: string, code: string, message: string): never {
  throw Object.assign(new Error(`${path}: ${message}`), {
    name: 'GuardPolicyError', issue: { path, code, message } satisfies ValidationIssue,
  });
}

export function resultOf<T>(read: () => T): ValidationResult<T> {
  try { return { ok: true, value: read() }; }
  catch (error) {
    if (error instanceof Error && 'issue' in error) {
      const issue = error.issue;
      if (issue !== null && typeof issue === 'object' && 'path' in issue && 'code' in issue && 'message' in issue &&
          typeof issue.path === 'string' && typeof issue.code === 'string' && typeof issue.message === 'string') {
        return { ok: false, issues: [{ path: issue.path, code: issue.code, message: issue.message }] };
      }
    }
    throw error;
  }
}

export function safeKey(key: string, path: string): string {
  if (unsafeKeys.has(key)) refuse(path, 'unsafe_key', `Reserved key ${key}`);
  return key;
}

export function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) refuse(path, 'object', 'Expected an object');
  return value as Record<string, unknown>;
}

export function keys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) refuse(`${path}.${key}`, 'unknown_key', 'Unknown key');
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) refuse(`${path}.${key}`, 'missing_key', 'Required key is missing');
  }
}

export function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) refuse(path, 'string', 'Expected a nonempty string of at most 512 characters');
  return value;
}

export function name(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(result)) refuse(path, 'identifier', 'Expected a Prisma identifier');
  return safeKey(result, path);
}

export function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') refuse(path, 'boolean', 'Expected a boolean');
  return value;
}

export function integer(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) refuse(path, 'integer', `Expected an integer between ${min} and ${max}`);
  return value;
}

export function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  const found = allowed.find(item => item === value);
  if (found === undefined) refuse(path, 'unsupported', `Expected one of: ${allowed.join(', ')}`);
  return found;
}

export function array<T>(value: unknown, path: string, read: (entry: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) refuse(path, 'array', 'Expected an array');
  return value.map((entry: unknown, index: number) => read(entry, `${path}[${index}]`));
}

export function distinct<T>(items: T[], key: (item: T) => string, path: string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) refuse(path, 'duplicate', `Duplicate entry: ${id}`);
    seen.add(id);
  }
  return items;
}

export function names(value: unknown, path: string): string[] {
  return distinct(array(value, path, name), entry => entry, path);
}

export function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
export function sorted<T>(items: readonly T[], key: (item: T) => string): T[] { return [...items].sort((a, b) => compare(key(a), key(b))); }

export function readJsonValue(input: unknown): JsonValue {
  let count = 0;
  let length = 0;
  const ancestors = new Set<object>();
  function read(value: unknown, path: string, depth: number): JsonValue {
    count += 1;
    if (count > MAX_NODES || depth > MAX_JSON_DEPTH) refuse(path, 'limit', 'JSON complexity limit exceeded');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : value;
    if (typeof value === 'string') {
      length += value.length;
      if (length > MAX_JSON_LENGTH) refuse(path, 'limit', 'JSON size limit exceeded');
      return value;
    }
    if (typeof value !== 'object' || value === null) refuse(path, 'json', 'Only finite JSON data is accepted');
    if (ancestors.has(value)) refuse(path, 'cycle', 'Cyclic data is not JSON');
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) refuse(path, 'prototype', 'Expected a plain JSON object');
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') refuse(path, 'json', 'Symbol keys are not JSON');
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) refuse(`${path}.${key}`, 'json', 'Accessors and hidden properties are not JSON');
      safeKey(key, path);
      length += key.length;
      if (length > MAX_JSON_LENGTH) refuse(path, 'limit', 'JSON size limit exceeded');
    }
    let result: JsonValue;
    if (Array.isArray(value)) {
      if (value.length > MAX_NODES || Object.keys(value).length !== value.length) refuse(path, 'json', 'Sparse or extended arrays are not JSON');
      result = Array.from({ length: value.length }, (_, index) => {
        const entry = descriptors[String(index)];
        if (!entry) refuse(path, 'json', 'Sparse arrays are not JSON');
        return read(entry.value, `${path}[${index}]`, depth + 1);
      });
    } else {
      result = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, read(descriptor.value, `${path}.${key}`, depth + 1)]));
    }
    ancestors.delete(value);
    return result;
  }
  return read(input, '$', 0);
}

export function parseJson(source: string): JsonValue {
  if (typeof source !== 'string' || source.length > MAX_JSON_LENGTH) refuse('$', 'limit', 'JSON text size limit exceeded');
  let position = 0;
  let nodes = 0;
  const ws = () => { while (/[\t\n\r ]/.test(source[position] ?? '\0')) position += 1; };
  function quoted(): string {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (character === '\\') { position += 1; continue; }
      if (character === '"') {
        try {
          const value: unknown = JSON.parse(source.slice(start, position));
          if (typeof value === 'string') return value;
        } catch { refuse('$', 'syntax', `Invalid string at offset ${start}`); }
      }
    }
    return refuse('$', 'syntax', `Unterminated string at offset ${start}`);
  }
  function read(depth: number): JsonValue {
    ws();
    nodes += 1;
    if (depth > MAX_JSON_DEPTH || nodes > MAX_NODES) refuse('$', 'limit', 'JSON complexity limit exceeded');
    const character = source[position];
    if (character === '"') return quoted();
    if (character === '{' || character === '[') {
      position += 1;
      ws();
      const entries: [string, JsonValue][] = [];
      const list: JsonValue[] = [];
      const seen = new Set<string>();
      const end = character === '{' ? '}' : ']';
      if (source[position] === end) { position += 1; return character === '{' ? {} : []; }
      while (position < source.length) {
        ws();
        if (character === '{') {
          if (source[position] !== '"') refuse('$', 'syntax', `Expected an object key at offset ${position}`);
          const key = safeKey(quoted(), '$');
          if (seen.has(key)) refuse('$', 'duplicate', `Duplicate JSON key: ${key}`);
          seen.add(key);
          ws();
          if (source[position++] !== ':') refuse('$', 'syntax', 'Expected a colon');
          entries.push([key, read(depth + 1)]);
        } else list.push(read(depth + 1));
        ws();
        const next = source[position++];
        if (next === end) return character === '{' ? Object.fromEntries(entries) : list;
        if (next !== ',') refuse('$', 'syntax', `Expected a comma or ${end}`);
      }
      refuse('$', 'syntax', 'Unterminated container');
    }
    const rest = source.slice(position);
    for (const [token, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (rest.startsWith(token)) { position += token.length; return value; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest)?.[0];
    if (number !== undefined) {
      position += number.length;
      const value = Number(number);
      if (!Number.isFinite(value)) refuse('$', 'json', 'Numbers must be finite');
      return value === 0 ? 0 : value;
    }
    return refuse('$', 'syntax', `Unexpected token at offset ${position}`);
  }
  const value = read(0);
  ws();
  if (position !== source.length) refuse('$', 'syntax', `Trailing data at offset ${position}`);
  return value;
}

export function canonicalJson(input: unknown): string {
  function sort(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(sort);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort(compare).map(key => [key, sort(value[key])]));
    return value;
  }
  return JSON.stringify(sort(readJsonValue(input)), null, 2);
}
