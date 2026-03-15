import type { QueryState, Operation, PayloadValue, Payload } from "./types.ts";

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as any;
  if (typeof obj === 'object') {
    const cloned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone((obj as any)[key]);
      }
    }
    return cloned;
  }
  return obj;
}

export class QueryBuilder {
  state = $state<QueryState>({
    operation: null,
    path: [],
    payload: {}
  });

  setOperation(operation: Operation | null) {
    this.state = {
      operation,
      path: [],
      payload: {}
    };
  }

  addArg(argName: string, initialValue: PayloadValue = {}) {
    if (!this.state.operation || !argName) return;

    const newPath = [...this.state.path, argName];

    const existing = this.getNestedValue(this.state.payload, newPath);
    const nextValue = existing !== undefined ? existing : initialValue;

    const nextPayload = this.setNestedValue(this.state.payload, newPath, nextValue);

    this.state = {
      ...this.state,
      path: newPath,
      payload: nextPayload
    };
  }

  toggleField(fieldName: string, value: PayloadValue | undefined) {
    if (!fieldName) return;

    const fullPath = [...this.state.path, fieldName];

    const nextPayload =
      value === undefined
        ? this.unsetNestedValue(this.state.payload, fullPath)
        : this.setNestedValue(this.state.payload, fullPath, value);

    this.state = {
      ...this.state,
      payload: nextPayload
    };
  }

  replacePayload(payload: Payload) {
    const safePayload = isPlainObject(payload) ? (payload as Payload) : {};
    this.state = {
      ...this.state,
      payload: deepClone(safePayload)
    };
  }

  removeArg(index: number) {
    if (index < -1 || index >= this.state.path.length) return;

    const newPath = index === -1 ? [] : this.state.path.slice(0, index + 1);

    this.state = {
      ...this.state,
      path: newPath
    };
  }

  private getNestedValue(obj: Payload, path: string[]): PayloadValue | undefined {
    let cur: any = obj;
    for (const k of path) {
      if (!isPlainObject(cur) || !Object.prototype.hasOwnProperty.call(cur, k)) {
        return undefined;
      }
      cur = cur[k];
    }
    return cur as PayloadValue;
  }

  private setNestedValue(obj: Payload, path: string[], value: PayloadValue): Payload {
    if (path.length === 0) return obj;

    const [first, ...rest] = path;

    if (rest.length === 0) {
      return { ...obj, [first]: deepClone(value) };
    }

    const nested = obj[first];
    const nestedObj = isPlainObject(nested) ? (nested as Payload) : {};

    return {
      ...obj,
      [first]: this.setNestedValue(nestedObj, rest, value)
    };
  }

  private unsetNestedValue(obj: Payload, path: string[]): Payload {
    if (path.length === 0) return obj;

    const [first, ...rest] = path;

    if (!Object.prototype.hasOwnProperty.call(obj, first)) return obj;

    if (rest.length === 0) {
      const { [first]: _removed, ...restObj } = obj as any;
      return restObj as Payload;
    }

    const nested = obj[first];
    if (!isPlainObject(nested)) return obj;

    const nextNested = this.unsetNestedValue(nested as Payload, rest);

    if (Object.keys(nextNested).length === 0) {
      const { [first]: _removed, ...restObj } = obj as any;
      return restObj as Payload;
    }

    return { ...obj, [first]: nextNested };
  }

  getPayload(): Payload {
    return deepClone(this.state.payload);
  }
}