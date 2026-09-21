import type { Capabilities, GuardPolicy, Operation, PolicyContext, SchemaDescriptor } from '../../dist/core/types.js';
export const schema: SchemaDescriptor;
export const capabilities: Capabilities;
export const context: PolicyContext;
export function freshContext(): PolicyContext;
export function policy(operation?: Operation, model?: string): GuardPolicy;
export function disabledPolicy(operation?: Operation, model?: string): GuardPolicy;
