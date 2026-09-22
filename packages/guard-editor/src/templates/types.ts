import type { ForcedValue, JsonValue, SchemaDescriptor, ValidationIssue } from '../core/types.js';
import type { ForcedGuardValue } from '../core/compiler.js';
import type { Payload } from '../query/types.js';

export const QUERY_OPERATIONS = ['findMany', 'findFirst', 'findUnique', 'create', 'update', 'delete'] as const;
export type QueryOperation = (typeof QUERY_OPERATIONS)[number];
export interface SchemaIdentity { id: string; revision: string }
export interface SavedQueryTemplate {
  version: 1;
  id: string;
  name: string;
  model: string;
  operation: QueryOperation;
  usageKey: string;
  payload: Payload;
  enabled: boolean;
  accepted: boolean;
  schema: SchemaIdentity;
}
export interface TemplateContext {
  schema: SchemaDescriptor;
  identity: SchemaIdentity;
  maxRelationDepth: number;
  maxTake: number;
}
export type TemplateState = 'stale' | 'invalid' | 'draft' | 'disabled' | 'accepted';
export interface TemplateInspection { state: TemplateState; issues: ValidationIssue[] }
export type ShapeNode = true | ForcedGuardValue | { [key: string]: ShapeNode } | { default: number; max: number };
export interface TemplateGuardShape { [key: string]: ShapeNode }
export interface TrustedConstraint { target: 'where' | 'data'; field: string; value: ForcedValue }
export interface TrustedSourceRequest { source: string; model: string; operation: QueryOperation; usageKey: string; target: 'where' | 'data'; field: string }
export type TrustedSourceResolver = (request: Readonly<TrustedSourceRequest>) => JsonValue;
export interface DerivedTemplate {
  queryId: string; model: string; operation: QueryOperation; usageKey: string; schema: SchemaIdentity;
  shape: TemplateGuardShape;
  requirements: { enforceProjection: true; trustedVariantSelection: true };
}
export interface HookReferences { before: string[]; after: string[] }
export interface TrustedRoute { id: string; label: string; model: string; operation: QueryOperation }
export interface UsageBinding { routeId: string; queryId: string; model: string; operation: QueryOperation; usageKey: string }
export interface UsageManifest { version: 1; schema: SchemaIdentity; bindings: UsageBinding[] }
export interface TrustedVariantExtension {
  queryId: string; constraints: TrustedConstraint[]; hooks: HookReferences;
}
export interface TrustedOperationExtension { model: string; operation: QueryOperation; hooks: HookReferences }
export interface TrustedGenerationContext {
  routes: TrustedRoute[];
  hookIds: string[];
  variants: TrustedVariantExtension[];
  operations: TrustedOperationExtension[];
}
export interface GeneratedUsage {
  routeId: string; queryId: string; model: string; operation: QueryOperation; usageKey: string;
  hooks: { before: string[]; after: string[] };
}
export interface GeneratedUsageManifest {
  version: 1; schema: SchemaIdentity; variants: DerivedTemplate[]; routes: GeneratedUsage[];
  variantSelection: 'trusted-server-route-only';
}
