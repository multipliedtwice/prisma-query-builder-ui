import type { QueryState, Operation, PayloadValue, Payload } from "./types.ts";
import { isPlainObject } from "./helpers.ts";

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map((item) => deepClone(item)) as any;
  if (typeof obj === "object") {
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

  addArg(argName: string | string[], initialValue: PayloadValue = {}) {
    if (!this.state.operation) return;

    const segments =
      typeof argName === "string" ? [argName] : argName;
    if (segments.length === 0) return;
    if (segments.length === 1 && !segments[0]) return;

    const newPath = [...this.state.path, ...segments];

    const existing = this.getNestedValue(this.state.payload, newPath);
    const nextValue = existing !== undefined ? existing : initialValue;

    const nextPayload = this.setNestedValue(
      this.state.payload,
      newPath,
      nextValue
    );

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

  addArrayItem(arrayPath: string[]): number {
    const current = this.getNestedValue(this.state.payload, arrayPath);
    const arr = Array.isArray(current)
      ? [...(current as PayloadValue[])]
      : [];
    const newIndex = arr.length;
    arr.push({});
    const nextPayload = this.setNestedValue(
      this.state.payload,
      arrayPath,
      arr as PayloadValue
    );
    this.state = { ...this.state, payload: nextPayload };
    return newIndex;
  }

  removeArrayItem(arrayPath: string[], index: number): void {
    const current = this.getNestedValue(this.state.payload, arrayPath);
    if (!Array.isArray(current) || current.length <= 1) return;
    const arr = (current as PayloadValue[]).filter((_, i) => i !== index);
    const nextPayload = this.setNestedValue(
      this.state.payload,
      arrayPath,
      arr as PayloadValue
    );

    let newPath = [...this.state.path];

    let pathMatchesArray =
      this.state.path.length > arrayPath.length;
    for (let i = 0; i < arrayPath.length && pathMatchesArray; i++) {
      if (this.state.path[i] !== arrayPath[i]) pathMatchesArray = false;
    }

    if (pathMatchesArray) {
      const indexSegment = this.state.path[arrayPath.length];
      if (indexSegment !== undefined && /^\d+$/.test(indexSegment)) {
        const currentIdx = parseInt(indexSegment, 10);
        let newIdx = currentIdx;
        if (currentIdx >= arr.length) {
          newIdx = arr.length - 1;
        } else if (currentIdx > index) {
          newIdx = currentIdx - 1;
        }
        newPath = [...arrayPath, String(newIdx)];
      }
    }

    this.state = {
      ...this.state,
      path: newPath,
      payload: nextPayload
    };
  }

  private getNestedValue(
    obj: Payload,
    path: string[]
  ): PayloadValue | undefined {
    let cur: any = obj;
    for (const k of path) {
      if (cur === null || cur === undefined) return undefined;
      if (Array.isArray(cur) && /^\d+$/.test(k)) {
        const idx = parseInt(k, 10);
        if (idx >= cur.length) return undefined;
        cur = cur[idx];
      } else if (
        isPlainObject(cur) &&
        Object.prototype.hasOwnProperty.call(cur, k)
      ) {
        cur = cur[k];
      } else {
        return undefined;
      }
    }
    return cur as PayloadValue;
  }

  private setNestedValue(
    obj: Payload,
    path: string[],
    value: PayloadValue
  ): Payload {
    if (path.length === 0) return obj;

    const [first, ...rest] = path;

    if (rest.length === 0) {
      return { ...obj, [first]: deepClone(value) };
    }

    const nested = obj[first];

    if (rest.length > 0 && /^\d+$/.test(rest[0])) {
      const arr = Array.isArray(nested) ? nested : [];
      return {
        ...obj,
        [first]: this.setInArray(arr as PayloadValue[], rest, value)
      };
    }

    const nestedObj = isPlainObject(nested) ? (nested as Payload) : {};

    return {
      ...obj,
      [first]: this.setNestedValue(nestedObj, rest, value)
    };
  }

  private setInArray(
    arr: PayloadValue[],
    path: string[],
    value: PayloadValue
  ): PayloadValue[] {
    if (path.length === 0) return arr;

    const [first, ...rest] = path;

    if (!/^\d+$/.test(first)) return arr;

    const index = parseInt(first, 10);
    const newArray = [...arr];
    while (newArray.length <= index) newArray.push(null);

    if (rest.length === 0) {
      newArray[index] = deepClone(value);
      return newArray;
    }

    const item = newArray[index];

    if (rest.length > 0 && /^\d+$/.test(rest[0])) {
      const innerArr = Array.isArray(item) ? item : [];
      newArray[index] = this.setInArray(
        innerArr as PayloadValue[],
        rest,
        value
      );
      return newArray;
    }

    const itemObj = isPlainObject(item) ? (item as Payload) : {};
    newArray[index] = this.setNestedValue(itemObj, rest, value);
    return newArray;
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

    if (
      Array.isArray(nested) &&
      rest.length > 0 &&
      /^\d+$/.test(rest[0])
    ) {
      const index = parseInt(rest[0], 10);
      if (index >= nested.length) return obj;
      const afterIndex = rest.slice(1);
      if (afterIndex.length === 0) return obj;
      const item = nested[index];
      if (!isPlainObject(item)) return obj;
      const nextItem = this.unsetNestedValue(item as Payload, afterIndex);
      const newArray = [...nested];
      newArray[index] = nextItem;
      return { ...obj, [first]: newArray };
    }

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