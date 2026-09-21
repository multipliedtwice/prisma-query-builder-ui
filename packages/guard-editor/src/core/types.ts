export const OPERATIONS = Object.freeze(['findMany', 'findManyPaginated', 'findUnique', 'create', 'update', 'delete'] as const);
export type Operation = (typeof OPERATIONS)[number];
export const SCALAR_TYPES = Object.freeze(['String', 'Boolean', 'Int', 'Float', 'Decimal', 'BigInt', 'DateTime', 'Json', 'Bytes'] as const);
export type ScalarType = (typeof SCALAR_TYPES)[number];
export const OPERATORS = Object.freeze(['equals', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'endsWith', 'has', 'hasSome', 'hasEvery', 'isEmpty'] as const);
export type Operator = (typeof OPERATORS)[number];
export const RELATION_OPERATORS = Object.freeze(['some', 'every', 'none', 'is', 'isNot'] as const);
export type RelationOperator = (typeof RELATION_OPERATORS)[number];
export const FORCE_TARGETS = Object.freeze(['where', 'create', 'update'] as const);
export type ForceTarget = (typeof FORCE_TARGETS)[number];
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface FieldBase { name: string; list: boolean; nullable: boolean }
export type ScalarField = FieldBase & { kind: 'scalar'; type: ScalarType; writable: boolean; hasDefault: boolean };
export type EnumField = FieldBase & { kind: 'enum'; type: string; values: string[]; writable: boolean; hasDefault: boolean };
export type ValueField = ScalarField | EnumField;
export type RelationField = FieldBase & { kind: 'relation'; model: string };
export type FieldDescriptor = ValueField | RelationField | (FieldBase & { kind: 'unsupported'; type: string });
export interface UniqueSelector { name: string; fields: string[] }
export interface ModelDescriptor { name: string; fields: FieldDescriptor[]; uniqueSelectors: UniqueSelector[] }
export interface SchemaDescriptor { version: 1; models: ModelDescriptor[] }

export interface FilterCapability { field: string; operators: Operator[] }
export interface RelationCapability { field: string; select: boolean; where: RelationOperator[] }
export interface ForcedCapability { field: string; targets: ForceTarget[]; literals: boolean; sources: string[] }
export interface ModelCapability {
  model: string;
  select: string[];
  where: FilterCapability[];
  unique: string[];
  orderBy: string[];
  create: string[];
  update: string[];
  relations: RelationCapability[];
  forced: ForcedCapability[];
}
export interface NamedSource { name: string; label: string }
export interface Capabilities {
  version: 1;
  operations: Operation[];
  models: ModelCapability[];
  maxRelationDepth: number;
  pagination: { max: number; allowSkip: boolean };
  sources: NamedSource[];
}
export type ForcedValue = { kind: 'literal'; value: JsonValue } | { kind: 'source'; name: string };
export interface Pagination { default: number; max: number }
export type Selection = { kind: 'field'; field: string } | { kind: 'relation'; field: string; select: Selection[]; take: Pagination | null };
export type WhereRule =
  | { kind: 'scalar'; field: string; operators: Operator[] }
  | { kind: 'forced'; field: string; value: ForcedValue }
  | { kind: 'relation'; field: string; branches: { operator: RelationOperator; where: WhereRule[] }[] };
export type DataRule = { kind: 'client'; field: string } | { kind: 'forced'; field: string; value: ForcedValue };
export interface GuardPolicy {
  version: 1;
  model: string;
  operation: Operation;
  enabled: boolean;
  select: Selection[];
  where: WhereRule[];
  unique: string[];
  orderBy: string[];
  data: DataRule[];
  skip: boolean;
  take: Pagination | null;
}
export interface PolicyContext { schema: SchemaDescriptor; capabilities: Capabilities }
export interface ValidationIssue { path: string; code: string; message: string }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };
export interface SourceRequest { source: string; model: string; field: string; target: ForceTarget }
export type SourceResolver = (request: Readonly<SourceRequest>) => JsonValue;
