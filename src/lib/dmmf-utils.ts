import type { DmmfInputTypeRef } from "./types.ts";

export function isObjectRef(r: DmmfInputTypeRef): boolean {
  const loc = (r.location ?? "").toLowerCase();
  const kind = (r.kind ?? "").toLowerCase();
  if (kind === "object") return true;
  if (loc.includes("inputobject")) return true;
  if (loc === "inputobjecttypes") return true;
  return false;
}

export function isEnumRef(r: DmmfInputTypeRef): boolean {
  const loc = (r.location ?? "").toLowerCase();
  const kind = (r.kind ?? "").toLowerCase();
  if (kind === "enum") return true;
  if (loc.includes("enum")) return true;
  if (loc === "enumtypes") return true;
  return false;
}

export function isScalarRef(r: DmmfInputTypeRef): boolean {
  const loc = (r.location ?? "").toLowerCase();
  const kind = (r.kind ?? "").toLowerCase();
  if (kind === "scalar") return true;
  if (loc === "scalar") return true;
  return !isObjectRef(r) && !isEnumRef(r);
}

export function hasEnumType(refs: DmmfInputTypeRef[]): boolean {
  return refs.some((r) => r.type && isEnumRef(r));
}

export function hasObjectType(refs: DmmfInputTypeRef[]): boolean {
  return refs.some((r) => r.type && isObjectRef(r));
}

export function getEnumTypeName(refs: DmmfInputTypeRef[]): string | null {
  const enumRef = refs.find((r) => r.type && isEnumRef(r));
  return enumRef?.type ?? null;
}

export function getScalarTypeName(refs: DmmfInputTypeRef[]): string | null {
  const sc = refs.find((r) => r.type && isScalarRef(r));
  return sc?.type ?? null;
}

export function pickObjectTypeName(refs: DmmfInputTypeRef[]): string | null {
  const obj = refs.find((r) => r.type && isObjectRef(r));
  return obj?.type ?? null;
}

export function pickAllObjectTypeNames(refs: DmmfInputTypeRef[]): string[] {
  return refs.filter((r) => r.type && isObjectRef(r)).map((r) => r.type);
}