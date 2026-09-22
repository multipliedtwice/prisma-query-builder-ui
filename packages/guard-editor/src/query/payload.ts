import type { Payload, PayloadValue } from './types.js';
import { parseJson, readJsonValue, refuse, safeKey } from '../core/json.js';

export function isPlainObject(value: unknown): value is Payload {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function clonePayload(value: Payload): Payload {
  const clone = readJsonValue(value);
  if (!isPlainObject(clone)) refuse('$query', 'object', 'Query arguments must be an object');
  return clone;
}
export function valueAt(value: PayloadValue, path: readonly string[]): PayloadValue | undefined {
  let current: PayloadValue | undefined = value;
  for (const key of path) {
    if (Array.isArray(current) && /^\d+$/.test(key)) current = current[Number(key)];
    else if (isPlainObject(current) && Object.hasOwn(current, key)) current = current[key];
    else return undefined;
  }
  return current;
}
export function setValue(payload: Payload, path: readonly string[], value: PayloadValue | undefined): Payload {
  if (!path.length) return clonePayload(payload);
  for (const segment of path) safeKey(segment, '$query.path');
  function set(current: PayloadValue, segments: readonly string[]): PayloadValue {
    const [key, ...rest] = segments;
    if (key === undefined) return value === undefined ? current : readJsonValue(value);
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(key)) refuse('$query.path', 'array_index', 'Expected an array index');
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index > current.length || index > 1000) refuse('$query.path', 'array_index', 'Array index is out of range');
      const copy = [...current];
      if (!rest.length && value === undefined) copy.splice(index, 1);
      else copy[index] = set(copy[index] ?? {}, rest);
      return copy;
    }
    const result: Payload = isPlainObject(current) ? { ...current } : {};
    if (!rest.length && value === undefined) delete result[key];
    else {
      const child = set(result[key] ?? (/^\d+$/.test(rest[0] ?? '') ? [] : {}), rest);
      if (value === undefined && isPlainObject(child) && Object.keys(child).length === 0) delete result[key];
      else result[key] = child;
    }
    return result;
  }
  const result = set(payload, path);
  if (!isPlainObject(result)) refuse('$query', 'object', 'Query arguments must remain an object');
  return clonePayload(result);
}
export function normalizePrismaPayload(payload: Payload): Payload {
  return { ...payload, ...(typeof payload.distinct === 'string' ? { distinct: [payload.distinct] } : {}),
    ...(isPlainObject(payload.orderBy) ? { orderBy: [payload.orderBy] } : {}) };
}
export function parseQueryArguments(source: string): Payload {
  const value = parseJson(source);
  if (!isPlainObject(value)) refuse('$query', 'object', 'Query arguments must be an object');
  return value;
}
