export type ArgContext = 'select' | 'include' | 'where' | 'data' | 'orderBy' | null;
export type OperationType = 'read' | 'write';
export interface DmmfInputTypeRef { type: string; isList: boolean; kind?: string; location?: string }
export interface Operation { type: OperationType; model: string; method: string; args: ArgDefinition[] }
export interface ArgDefinition {
  name: string; type: string; isRequired: boolean; isNullable: boolean;
  inputTypes?: DmmfInputTypeRef[]; objectTypeName?: string | null; fields?: FieldDefinition[];
}
export interface FieldDefinition {
  name: string; type: string; isRelation: boolean; isList?: boolean; relationModel?: string;
  inputTypes?: DmmfInputTypeRef[]; objectTypeName?: string | null;
}
export type PayloadValue = string | number | boolean | null | PayloadValue[] | { [key: string]: PayloadValue };
export type Payload = { [key: string]: PayloadValue };
export interface QueryState { operation: Operation | null; path: string[]; payload: Payload }
export interface QuerySchema {
  getInputTypeFields(name: string): FieldDefinition[];
  getEnumValues(name: string): string[];
}
export interface QueryBuilderLike {
  state: QueryState;
  setOperation(operation: Operation | null): void;
  addArg(argName: string | string[], initialValue?: PayloadValue): void;
  toggleField(fieldName: string, value: PayloadValue | undefined): void;
  replacePayload(payload: Payload): void;
  removeArg(index: number): void;
  getPayload(): Payload;
  addArrayItem(arrayPath: string[]): number;
  removeArrayItem(arrayPath: string[], index: number): void;
}
