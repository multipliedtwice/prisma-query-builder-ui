import type { DMMFParser } from "./dmmf-parser.ts";
import type { DmmfInputTypeRef, FieldDefinition, QueryState } from "./types.ts";

type Issue = { path: string; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isObjectRef(r: DmmfInputTypeRef): boolean {
  const loc = (r.location ?? "").toLowerCase();
  const kind = (r.kind ?? "").toLowerCase();
  if (kind === "object") return true;
  if (loc.includes("inputobject")) return true;
  if (loc === "inputobjecttypes") return true;
  return false;
}

function isEnumRef(r: DmmfInputTypeRef): boolean {
  const loc = (r.location ?? "").toLowerCase();
  const kind = (r.kind ?? "").toLowerCase();
  if (kind === "enum") return true;
  if (loc.includes("enum")) return true;
  if (loc === "enumtypes") return true;
  return false;
}

function isScalarRef(r: DmmfInputTypeRef): boolean {
  const loc = (r.location ?? "").toLowerCase();
  const kind = (r.kind ?? "").toLowerCase();
  if (kind === "scalar") return true;
  if (loc === "scalar") return true;
  return !isObjectRef(r) && !isEnumRef(r);
}

function issue(path: string, message: string): Issue {
  return { path: path || "$", message };
}

function formatIssues(issues: Issue[]): string {
  return issues.map((i) => `${i.path}: ${i.message}`).join("\n");
}

function requireNonEmptyObject(obj: unknown): boolean {
  return isPlainObject(obj) && Object.keys(obj).length > 0;
}

function validateScalar(typeName: string, value: unknown): string | null {
  if (value === null) return null;

  if (typeName === "String")
    return typeof value === "string" ? null : "must be a string";
  if (typeName === "Boolean")
    return typeof value === "boolean" ? null : "must be a boolean";

  if (typeName === "Int")
    return Number.isInteger(value) ? null : "must be an integer";
  if (typeName === "Float")
    return typeof value === "number" ? null : "must be a number";

  if (typeName === "BigInt")
    return typeof value === "bigint" ||
      (typeof value === "number" && Number.isInteger(value))
      ? null
      : "must be a bigint/integer";

  if (typeName === "Decimal")
    return typeof value === "number" || typeof value === "string"
      ? null
      : "must be a decimal (number or string)";
  if (typeName === "DateTime")
    return typeof value === "string" ? null : "must be an ISO datetime string";

  if (typeName === "Json") return null;

  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
    ? null
    : "must be a scalar";
}

function pickObjectTypeName(refs: DmmfInputTypeRef[]): string | null {
  const obj = refs.find((r) => r.type && isObjectRef(r));
  return obj?.type ?? null;
}

function pickEnumTypeName(refs: DmmfInputTypeRef[]): string | null {
  const en = refs.find((r) => r.type && isEnumRef(r));
  return en?.type ?? null;
}

function pickScalarTypeName(refs: DmmfInputTypeRef[]): string | null {
  const sc = refs.find((r) => r.type && isScalarRef(r));
  return sc?.type ?? null;
}

function validateByRefs(
  parser: DMMFParser,
  value: unknown,
  refs: DmmfInputTypeRef[],
  path: string,
): Issue[] {
  const issues: Issue[] = [];

  if (!refs || refs.length === 0) return issues;

  const isList = refs.some((r) => r.isList);
  if (isList) {
    if (!Array.isArray(value)) {
      issues.push(issue(path, "must be an array"));
      return issues;
    }
    const elementRefs = refs.map((r) => ({ ...r, isList: false }));
    value.forEach((item, idx) => {
      issues.push(
        ...validateByRefs(parser, item, elementRefs, `${path}[${idx}]`),
      );
    });
    return issues;
  }

  const objectTypeName = pickObjectTypeName(refs);
  const enumTypeName = pickEnumTypeName(refs);
  const scalarTypeName = pickScalarTypeName(refs);

  if (isPlainObject(value)) {
    if (!objectTypeName) {
      issues.push(issue(path, "unexpected object value"));
      return issues;
    }

    const fields = parser.getInputTypeFields(objectTypeName);
    const fieldMap = new Map<string, FieldDefinition>(
      fields.map((f) => [f.name, f]),
    );

    for (const k of Object.keys(value)) {
      const f = fieldMap.get(k);
      if (!f) {
        issues.push(
          issue(`${path}.${k}`, `unknown field for ${objectTypeName}`),
        );
        continue;
      }
      const v = (value as any)[k];
      issues.push(
        ...validateByRefs(parser, v, f.inputTypes ?? [], `${path}.${k}`),
      );
    }

    return issues;
  }

  if (typeof value === "string") {
    if (enumTypeName) {
      const validValues = parser.getEnumValues(enumTypeName);
      if (validValues.length > 0 && !validValues.includes(value)) {
        issues.push(issue(path, `must be one of: ${validValues.join(", ")}`));
      }
      return issues;
    }

    if (scalarTypeName) {
      const err = validateScalar(scalarTypeName, value);
      if (err) issues.push(issue(path, err));
      return issues;
    }

    if (objectTypeName) {
      issues.push(issue(path, "expected object but got string"));
      return issues;
    }

    return issues;
  }

  if (scalarTypeName) {
    const err = validateScalar(scalarTypeName, value);
    if (err) issues.push(issue(path, err));
    return issues;
  }

  if (objectTypeName) {
    issues.push(issue(path, "must be an object"));
    return issues;
  }

  return issues;
}

function validateTopArgs(parser: DMMFParser, state: QueryState): Issue[] {
  const issues: Issue[] = [];
  const op = state.operation;
  if (!op) {
    issues.push(issue("$", "no operation selected"));
    return issues;
  }

  const payload = state.payload ?? {};

  for (const arg of op.args) {
    if (arg.isRequired && (payload as any)[arg.name] === undefined) {
      issues.push(issue(`$.${arg.name}`, "is required"));
    }
  }

  for (const arg of op.args) {
    const v = (payload as any)[arg.name];
    if (v === undefined) continue;
    issues.push(
      ...validateByRefs(parser, v, arg.inputTypes ?? [], `$.${arg.name}`),
    );
  }

  return issues;
}

function validateNonEmptySelectRules(state: QueryState): Issue[] {
  const issues: Issue[] = [];
  if (!state.operation) return issues;

  const method = state.operation.method;
  const payload = state.payload ?? {};

  const select = (payload as any).select;
  const include = (payload as any).include;

  if (select !== undefined && !requireNonEmptyObject(select)) {
    issues.push(issue("$.select", "must not be empty"));
  }

  if (include !== undefined && !requireNonEmptyObject(include)) {
    issues.push(issue("$.include", "must not be empty"));
  }

  if (method === "aggregate") {
    if (select === undefined) {
      issues.push(issue("$.select", "is required for aggregate"));
    } else if (!requireNonEmptyObject(select)) {
      issues.push(issue("$.select", "must not be empty for aggregate"));
    }
  }

  return issues;
}

function validateOrderByNonEmptyRules(state: QueryState): Issue[] {
  const issues: Issue[] = [];
  if (!state.operation) return issues;

  const payload = state.payload ?? {};
  const orderBy = (payload as any).orderBy;

  if (orderBy === undefined) return issues;

  if (Array.isArray(orderBy)) {
    if (orderBy.length === 0) {
      issues.push(issue("$.orderBy", "must not be empty"));
      return issues;
    }
    orderBy.forEach((item, idx) => {
      if (!requireNonEmptyObject(item)) {
        issues.push(issue(`$.orderBy[${idx}]`, "must be a non-empty object"));
      }
    });
    return issues;
  }

  if (!requireNonEmptyObject(orderBy)) {
    issues.push(issue("$.orderBy", "must be a non-empty object"));
  }

  return issues;
}

function validateWhereScalarValues(state: QueryState): Issue[] {
  const issues: Issue[] = [];
  const payload = state.payload ?? {};
  const where = (payload as any).where;
  
  if (!where || !isPlainObject(where)) return issues;

  function checkWhereObject(obj: any, path: string) {
    if (!isPlainObject(obj)) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = `${path}.${key}`;
      
      // Check for empty string values in common filter operators
      if (['equals', 'not', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'endsWith'].includes(key)) {
        if (value === "" || value === null) {
          issues.push(issue(currentPath, `filter value cannot be empty`));
        }
      }
      
      // Recursively check nested objects
      if (isPlainObject(value)) {
        checkWhereObject(value, currentPath);
      }
    }
  }
  
  checkWhereObject(where, "$.where");
  return issues;
}

export function validateQueryState(
  parser: DMMFParser,
  state: QueryState,
): { ok: true } | { ok: false; error: string } {
  const issues = [
    ...validateTopArgs(parser, state),
    ...validateNonEmptySelectRules(state),
    ...validateOrderByNonEmptyRules(state),
    ...validateWhereScalarValues(state),
  ];

  if (issues.length === 0) return { ok: true };
  return { ok: false, error: formatIssues(issues) };
}
