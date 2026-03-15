import type { DMMF } from "@prisma/generator-helper";

export type ArgContext = "select" | "include" | "where" | "data" | "orderBy" | null;
export type OperationType = "read" | "write";

export type DmmfInputTypeRef = {
  type: string;
  isList: boolean;
  kind?: string;
  location?: string;
};

export type Operation = {
  type: OperationType;
  model: string;
  method: string;
  args: ArgDefinition[];
};

export type ArgDefinition = {
  name: string;
  type: string;
  isRequired: boolean;
  isNullable: boolean;
  inputTypes?: DmmfInputTypeRef[];
  objectTypeName?: string | null;
  fields?: FieldDefinition[];
};

export type FieldDefinition = {
  name: string;
  type: string;
  isRelation: boolean;
  isList?: boolean;
  relationModel?: string;
  inputTypes?: DmmfInputTypeRef[];
  objectTypeName?: string | null;
};

export type PayloadValue =
  | string
  | number
  | boolean
  | null
  | PayloadValue[]
  | { [key: string]: PayloadValue };

export type Payload = { [key: string]: PayloadValue };

export type QueryState = {
  operation: Operation | null;
  path: string[];
  payload: Payload;
};

export type DMMFData = {
  datamodel: {
    models: DMMF.Model[];
    enums: DMMF.DatamodelEnum[];
  };
  schema: DMMF.Schema;
  mappings: DMMF.Mappings;
};

export type NavigationResult = {
  args: ArgDefinition[] | null;
  fields: FieldDefinition[] | null;
};

export type QueryTab = {
  id: string;
  label: string;
  isCustomName: boolean;
  builder: any;
  workspaceId: string | null;
  savedQueryId: string | null;
  isDirty: boolean;
  initialPayload: string;
  createdAt: Date;
};

export type SavedQuery = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  method: string;
  payload: string;
  workspaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionTab = {
  id: string;
  label: string;
  isCustomName: boolean;
  workspaceId: string | null;
  savedQueryId: string | null;
  queryState: QueryState;
  initialPayload: string;
  createdAt: string;
};

export interface EmbeddedConfig {
  isEmbedded: boolean;
  disablePersistence: boolean;
}

export const defaultEmbeddedConfig: EmbeddedConfig = {
  isEmbedded: false,
  disablePersistence: false,
};