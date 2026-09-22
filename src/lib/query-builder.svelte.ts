import type { QueryState, Operation, PayloadValue, Payload } from "../../packages/guard-editor/src/query/types.js";
import { clonePayload, valueAt, setValue } from "../../packages/guard-editor/src/query/payload.js";

export class QueryBuilder {
  state = $state<QueryState>({ operation: null, path: [], payload: {} });
  setOperation(operation: Operation | null) { this.state = { operation, path: [], payload: {} }; }
  addArg(argName: string | string[], initialValue: PayloadValue = {}) {
    if (!this.state.operation) return;
    const segments = typeof argName === 'string' ? [argName] : argName;
    if (!segments.length || segments.some(segment => !segment)) return;
    const path = [...this.state.path, ...segments];
    const existing = valueAt(this.state.payload, path);
    this.state = { ...this.state, path, payload: existing === undefined ? setValue(this.state.payload, path, initialValue) : this.state.payload };
  }
  toggleField(fieldName: string, value: PayloadValue | undefined) {
    if (fieldName) this.state = { ...this.state, payload: setValue(this.state.payload, [...this.state.path, fieldName], value) };
  }
  replacePayload(payload: Payload) { this.state = { ...this.state, payload: clonePayload(payload) }; }
  removeArg(index: number) {
    if (index >= -1 && index < this.state.path.length) this.state = { ...this.state, path: this.state.path.slice(0, index + 1) };
  }
  addArrayItem(arrayPath: string[]): number {
    const current = valueAt(this.state.payload, arrayPath);
    const array = Array.isArray(current) ? current : [];
    this.state = { ...this.state, payload: setValue(this.state.payload, arrayPath, [...array, {}]) };
    return array.length;
  }
  removeArrayItem(arrayPath: string[], index: number): void {
    const current = valueAt(this.state.payload, arrayPath);
    if (!Array.isArray(current) || current.length <= 1 || index < 0 || index >= current.length) return;
    const array = current.filter((_, at) => at !== index);
    let path = this.state.path;
    if (arrayPath.every((part, at) => path[at] === part) && /^\d+$/.test(path[arrayPath.length] ?? '')) {
      const active = Number(path[arrayPath.length]);
      path = [...arrayPath, String(Math.max(0, Math.min(array.length - 1, active > index ? active - 1 : active)))];
    }
    this.state = { ...this.state, path, payload: setValue(this.state.payload, arrayPath, array) };
  }
  getPayload(): Payload { return clonePayload(this.state.payload); }
}
