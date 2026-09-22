import { MAX_JSON_LENGTH, parseJson, readJsonValue, refuse, safeKey } from '../core/json.js';
import { isPlainObject } from './payload.js';
import type { Operation, Payload, PayloadValue } from './types.js';

export function parseQueryLiteral(source: string): Payload {
  if (source.length > MAX_JSON_LENGTH) refuse('$code', 'size', 'The query is too large');
  let offset = 0;
  let nodes = 0;
  const fail = (): never => refuse(`$code[${offset}]`, 'syntax', 'Use a Prisma object literal containing JSON values, not executable expressions');
  const whitespace = () => { while (/\s/.test(source[offset] ?? '') && offset < source.length) offset++; };
  function string(): string {
    const quote = source[offset++];
    let result = '';
    while (offset < source.length) {
      const char = source[offset++];
      if (char === quote) return result;
      if (char.charCodeAt(0) < 32) fail();
      if (char !== '\\') { result += char; continue; }
      const escape = source[offset++];
      const escapes: Record<string, string> = { '"': '"', "'": "'", '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (escape === 'u') {
        const hex = source.slice(offset, offset + 4);
        if (!/^[a-fA-F0-9]{4}$/.test(hex)) fail();
        result += String.fromCharCode(parseInt(hex, 16)); offset += 4;
      } else if (Object.hasOwn(escapes, escape)) result += escapes[escape];
      else fail();
    }
    return fail();
  }
  function read(depth: number): PayloadValue {
    whitespace();
    if (++nodes > 20000 || depth > 64) fail();
    const char = source[offset];
    if (char === '"' || char === "'") return string();
    if (char === '{') {
      offset++; const output: Payload = {}; whitespace();
      if (source[offset] === '}') { offset++; return output; }
      while (offset < source.length) {
        whitespace();
        let key: string;
        if (source[offset] === '"' || source[offset] === "'") key = string();
        else {
          const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(offset));
          if (!match) return fail();
          key = match[0]; offset += key.length;
        }
        safeKey(key, '$code');
        if (Object.hasOwn(output, key)) refuse('$code', 'duplicate_key', `Duplicate query key: ${key}`);
        whitespace(); if (source[offset++] !== ':') fail();
        output[key] = read(depth + 1); whitespace();
        if (source[offset] === '}') { offset++; return output; }
        if (source[offset++] !== ',') fail();
        whitespace(); if (source[offset] === '}') { offset++; return output; }
      }
      return fail();
    }
    if (char === '[') {
      offset++; const output: PayloadValue[] = []; whitespace();
      if (source[offset] === ']') { offset++; return output; }
      while (offset < source.length) {
        output.push(read(depth + 1)); whitespace();
        if (source[offset] === ']') { offset++; return output; }
        if (source[offset++] !== ',') fail();
        whitespace(); if (source[offset] === ']') { offset++; return output; }
      }
      return fail();
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(offset));
    if (!literal) return fail();
    offset += literal[0].length;
    return parseJson(literal[0]);
  }
  const result = read(0); whitespace();
  if (offset !== source.length || !isPlainObject(result)) fail();
  const checked = readJsonValue(result);
  if (!isPlainObject(checked)) return fail();
  return checked;
}
export function parsePrismaQuery(source: string, operation: Operation | null): Payload {
  if (!operation) refuse('$code', 'operation', 'Select a Prisma operation first');
  const prefix = `await prisma.${operation.model.charAt(0).toLowerCase() + operation.model.slice(1)}.${operation.method}`;
  const code = source.trim().replace(/;$/, '').trim();
  if (!code.startsWith(prefix) || code.slice(prefix.length).trim()[0] !== '(' || !code.endsWith(')')) {
    refuse('$code', 'operation', 'Keep the selected Prisma model and operation; edit its query arguments only');
  }
  const body = code.slice(prefix.length).trim().slice(1, -1).trim();
  return body ? parseQueryLiteral(body) : {};
}
