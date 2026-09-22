import type { DMMF } from "@prisma/generator-helper";

export type { ArgContext, OperationType, DmmfInputTypeRef, Operation, ArgDefinition, FieldDefinition, PayloadValue, Payload, QueryState, QueryBuilderLike } from "../../packages/guard-editor/src/query/types.js";
import type { Operation, ArgDefinition, FieldDefinition, Payload, QueryState, QueryBuilderLike } from "../../packages/guard-editor/src/query/types.js";

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
  builder: QueryBuilderLike;
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
  schemaContent?: string | null;
  databaseUrl?: string | null;
  hideHeader?: boolean;
  hideWorkspaceManager?: boolean;
}

export const defaultEmbeddedConfig: EmbeddedConfig = {
  isEmbedded: false,
  disablePersistence: false
};