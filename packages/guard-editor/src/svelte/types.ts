import type { Capabilities, ForcedValue, GuardPolicy, Operation, SchemaDescriptor } from '../core/types.js';

export interface GuardShapeBuilderProps {
  schema: SchemaDescriptor;
  model: string;
  operation: Operation;
  policy: unknown;
  capabilities: Capabilities;
  readOnly?: boolean;
  onChange: (policy: GuardPolicy) => void;
}
export type RuleChoice = { kind: 'client' } | { kind: 'forced'; value: ForcedValue } | null;
