import type { DMMFParser } from "./dmmf-parser.ts";
import type { DmmfInputTypeRef, FieldDefinition, QueryState } from "./types.ts";
import { isPlainObject } from "./helpers.ts";
import {
  isObjectRef,
  isEnumRef,
  isScalarRef,
  pickAllObjectTypeNames,
  getEnumTypeName,
  getScalarTypeName
} from "./dmmf-utils.ts";

type Issue = { path: string; message: string };

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
  if (typeName === "Null") return null;

  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
    ? null
    : "must be a scalar";
}

function validateObjectAgainstType(
  parser: DMMFParser,
  value: Record<string, unknown>,
  typeName: string,
  path: string
): Issue[] {
  const typeIssues: Issue[] = [];
  const fields = parser.getInputTypeFields(typeName);
  const fieldMap = new Map<string, FieldDefinition>(
    fields.map((f) => [f.name, f])
  );

  for (const k of Object.keys(value)) {
    const f = fieldMap.get(k);
    if (!f) {
      typeIssues.push(
        issue(`${path}.${k}`, `unknown field for ${typeName}`)
      );
      continue;
    }
    const v = value[k];
    typeIssues.push(
      ...validateByRefs(parser, v, f.inputTypes ?? [], `${path}.${k}`)
    );
  }

  if (
    "select" in value &&
    "include" in value &&
    value.select !== undefined &&
    value.include !== undefined
  ) {
    typeIssues.push(
      issue(path, "select and include cannot be used together at the same level")
    );
  }

  if (
    "select" in value &&
    value.select !== undefined &&
    !requireNonEmptyObject(value.select)
  ) {
    typeIssues.push(issue(`${path}.select`, "must not be empty"));
  }

  if (
    "include" in value &&
    value.include !== undefined &&
    !requireNonEmptyObject(value.include)
  ) {
    typeIssues.push(issue(`${path}.include`, "must not be empty"));
  }

  return typeIssues;
}

function validateByRefs(
  parser: DMMFParser,
  value: unknown,
  refs: DmmfInputTypeRef[],
  path: string
): Issue[] {
  const issues: Issue[] = [];

  if (!refs || refs.length === 0) return issues;

  if (value === null) return issues;

  if (Array.isArray(value)) {
    const listRefs = refs.filter((r) => r.isList);
    if (listRefs.length === 0) {
      issues.push(issue(path, "unexpected array value"));
      return issues;
    }
    const elementRefs = listRefs.map((r) => ({ ...r, isList: false }));
    value.forEach((item, idx) => {
      issues.push(
        ...validateByRefs(parser, item, elementRefs, `${path}[${idx}]`)
      );
    });
    return issues;
  }

  const nonListRefs = refs.filter((r) => !r.isList);
  if (nonListRefs.length === 0) {
    issues.push(issue(path, "must be an array"));
    return issues;
  }

  const allObjectTypeNames = pickAllObjectTypeNames(nonListRefs);
  const enumTypeName = getEnumTypeName(nonListRefs);
  const scalarTypeName = getScalarTypeName(nonListRefs);

  if (isPlainObject(value)) {
    if (allObjectTypeNames.length === 0) {
      issues.push(issue(path, "unexpected object value"));
      return issues;
    }

    let bestIssues: Issue[] | null = null;

    for (const typeName of allObjectTypeNames) {
      const typeIssues = validateObjectAgainstType(
        parser,
        value as Record<string, unknown>,
        typeName,
        path
      );
      if (typeIssues.length === 0) return issues;
      if (bestIssues === null || typeIssues.length < bestIssues.length) {
        bestIssues = typeIssues;
      }
    }

    issues.push(...(bestIssues ?? []));
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

    if (allObjectTypeNames.length > 0) {
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

  if (allObjectTypeNames.length > 0) {
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
  const argNames = new Set(op.args.map((a) => a.name));

  for (const arg of op.args) {
    if (arg.isRequired && (payload as any)[arg.name] === undefined) {
      issues.push(issue(`$.${arg.name}`, "is required"));
    }
  }

  for (const key of Object.keys(payload)) {
    if (!argNames.has(key)) {
      issues.push(issue(`$.${key}`, "unknown argument"));
    }
  }

  for (const arg of op.args) {
    const v = (payload as any)[arg.name];
    if (v === undefined) continue;
    issues.push(
      ...validateByRefs(parser, v, arg.inputTypes ?? [], `$.${arg.name}`)
    );
  }

  return issues;
}

function validateSelectIncludeMutualExclusion(state: QueryState): Issue[] {
  const issues: Issue[] = [];
  if (!state.operation) return issues;

  const payload = state.payload ?? {};
  const select = (payload as any).select;
  const include = (payload as any).include;

  if (select !== undefined && include !== undefined) {
    issues.push(
      issue("$", "select and include cannot be used together at the same level")
    );
  }

  return issues;
}

function validateNonEmptySelectRules(state: QueryState): Issue[] {
  const issues: Issue[] = [];
  if (!state.operation) return issues;

  const payload = state.payload ?? {};

  const select = (payload as any).select;
  const include = (payload as any).include;

  if (select !== undefined && !requireNonEmptyObject(select)) {
    issues.push(issue("$.select", "must not be empty"));
  }

  if (include !== undefined && !requireNonEmptyObject(include)) {
    issues.push(issue("$.include", "must not be empty"));
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

function validateAggregateRequiresAggregation(state: QueryState): Issue[] {
  const issues: Issue[] = [];
  if (!state.operation) return issues;
  if (state.operation.method !== "aggregate") return issues;

  const payload = state.payload ?? {};
  const aggregateKeys = ["_count", "_avg", "_sum", "_min", "_max"];
  const hasAggregation = aggregateKeys.some(
    (k) => (payload as any)[k] !== undefined
  );

  if (!hasAggregation) {
    issues.push(
      issue(
        "$",
        "aggregate requires at least one of: _count, _avg, _sum, _min, _max"
      )
    );
  }

  return issues;
}

function validateGroupByRequiresBy(state: QueryState): Issue[] {
  const issues: Issue[] = [];
  if (!state.operation) return issues;
  if (state.operation.method !== "groupBy") return issues;

  const payload = state.payload ?? {};
  const by = (payload as any).by;

  if (by === undefined) {
    issues.push(issue("$.by", "is required for groupBy"));
    return issues;
  }

  if (Array.isArray(by) && by.length === 0) {
    issues.push(issue("$.by", "must not be empty"));
  }

  return issues;
}

export function validateQueryState(
  parser: DMMFParser,
  state: QueryState
): { ok: true } | { ok: false; error: string } {
  const issues = [
    ...validateTopArgs(parser, state),
    ...validateNonEmptySelectRules(state),
    ...validateSelectIncludeMutualExclusion(state),
    ...validateOrderByNonEmptyRules(state),
    ...validateAggregateRequiresAggregation(state),
    ...validateGroupByRequiresBy(state)
  ];

  if (issues.length === 0) return { ok: true };
  return { ok: false, error: formatIssues(issues) };
}