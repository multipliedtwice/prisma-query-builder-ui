import type { DMMF } from "@prisma/generator-helper";
import type {
  ArgDefinition,
  DMMFData,
  DmmfInputTypeRef,
  FieldDefinition,
  Operation,
  OperationType
} from "./types.ts";
import { isObjectRef, pickObjectTypeName } from "./dmmf-utils.ts";

function isReadAction(action: string): boolean {
  return (
    action.startsWith("find") ||
    action === "count" ||
    action === "aggregate" ||
    action === "groupBy"
  );
}

function uniqueBy<T>(arr: T[], keyFn: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function toInputTypeRefs(inputTypes: any): DmmfInputTypeRef[] {
  if (!Array.isArray(inputTypes)) return [];
  return inputTypes.map((it) => ({
    type: String(it?.type ?? ""),
    isList: Boolean(it?.isList),
    kind: it?.kind,
    location: it?.location
  }));
}

function typeLabelFromRefs(refs: DmmfInputTypeRef[]): string {
  const parts = uniqueBy(
    refs.filter((r) => r.type).map((r) => (r.isList ? `${r.type}[]` : r.type)),
    (s) => s
  );
  return parts.length ? parts.join(" | ") : "unknown";
}

type InputTypeMap = Map<string, DMMF.InputType>;
type InputFieldsCache = Map<string, FieldDefinition[]>;
type RootFieldMap = Map<string, DMMF.SchemaField>;
type EnumMap = Map<string, string[]>;

type ParserState = {
  dmmf: DMMFData;
  inputTypeMap: InputTypeMap;
  inputFieldsCache: InputFieldsCache;
  rootFieldMap: RootFieldMap;
  queryFieldSet: Set<string>;
  mutationFieldSet: Set<string>;
  enumMap: EnumMap;
};

function createParserState(dmmf: DMMFData): ParserState {
  if (!dmmf) throw new Error("DMMF data is required");
  if (!dmmf.schema) throw new Error("DMMF schema is required");
  if (!dmmf.mappings) throw new Error("DMMF mappings is required");
  if (!dmmf.datamodel?.models)
    throw new Error("DMMF datamodel.models is required");

  const inputTypeMap: InputTypeMap = new Map();
  const inputFieldsCache: InputFieldsCache = new Map();
  const enumMap: EnumMap = new Map();

  const prismaInput = (dmmf.schema.inputObjectTypes as any)?.prisma ?? [];
  const modelInput = (dmmf.schema.inputObjectTypes as any)?.model ?? [];
  for (const t of [...prismaInput, ...modelInput]) {
    if (t?.name) inputTypeMap.set(String(t.name), t);
  }

  const prismaEnums = (dmmf.schema.enumTypes as any)?.prisma ?? [];
  const modelEnums = (dmmf.schema.enumTypes as any)?.model ?? [];
  for (const e of [...prismaEnums, ...modelEnums]) {
    if (e?.name && Array.isArray(e?.values)) {
      enumMap.set(
        String(e.name),
        e.values.map((v: any) => String(v))
      );
    }
  }

  const rootFieldMap: RootFieldMap = new Map();
  const queryFieldSet = new Set<string>();
  const mutationFieldSet = new Set<string>();

  const prismaOutput =
    (dmmf.schema.outputObjectTypes as any)?.prisma ?? [];
  const queryType = (prismaOutput as DMMF.OutputType[]).find(
    (t) => t?.name === "Query"
  );
  const mutationType = (prismaOutput as DMMF.OutputType[]).find(
    (t) => t?.name === "Mutation"
  );

  const queryFields = (queryType?.fields ?? []) as DMMF.SchemaField[];
  const mutationFields = (mutationType?.fields ?? []) as DMMF.SchemaField[];

  for (const f of queryFields) {
    if (!f?.name) continue;
    rootFieldMap.set(String(f.name), f);
    queryFieldSet.add(String(f.name));
  }

  for (const f of mutationFields) {
    if (!f?.name) continue;
    rootFieldMap.set(String(f.name), f);
    mutationFieldSet.add(String(f.name));
  }

  return {
    dmmf,
    inputTypeMap,
    inputFieldsCache,
    rootFieldMap,
    queryFieldSet,
    mutationFieldSet,
    enumMap
  };
}

function getEnumValues(state: ParserState, enumName: string): string[] {
  return state.enumMap.get(enumName) ?? [];
}

function generateSelectFields(
  state: ParserState,
  modelName: string
): FieldDefinition[] {
  const model = state.dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) return [];

  const fields: FieldDefinition[] = [];

  for (const field of model.fields) {
    if (field.kind === "object") {
      const relatedModelArgsType = `${modelName}$${field.name}Args`;

      fields.push({
        name: field.name,
        type: `Boolean | ${relatedModelArgsType}`,
        isRelation: true,
        isList: field.isList,
        relationModel: field.type,
        inputTypes: [
          {
            type: "Boolean",
            isList: false,
            kind: "scalar",
            location: "scalar"
          },
          {
            type: relatedModelArgsType,
            isList: false,
            kind: "object",
            location: "inputObjectTypes"
          }
        ],
        objectTypeName: relatedModelArgsType
      });
    } else {
      fields.push({
        name: field.name,
        type: "Boolean",
        isRelation: false,
        isList: false,
        inputTypes: [
          {
            type: "Boolean",
            isList: false,
            kind: "scalar",
            location: "scalar"
          }
        ],
        objectTypeName: null
      });
    }
  }

  return fields;
}

function generateIncludeFields(
  state: ParserState,
  modelName: string
): FieldDefinition[] {
  const model = state.dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) return [];

  const fields: FieldDefinition[] = [];

  for (const field of model.fields) {
    if (field.kind === "object") {
      const relatedModelArgsType = `${modelName}$${field.name}Args`;

      fields.push({
        name: field.name,
        type: `Boolean | ${relatedModelArgsType}`,
        isRelation: true,
        isList: field.isList,
        relationModel: field.type,
        inputTypes: [
          {
            type: "Boolean",
            isList: false,
            kind: "scalar",
            location: "scalar"
          },
          {
            type: relatedModelArgsType,
            isList: false,
            kind: "object",
            location: "inputObjectTypes"
          }
        ],
        objectTypeName: relatedModelArgsType
      });
    }
  }

  return fields;
}

function getInputTypeFields(
  state: ParserState,
  typeName: string
): FieldDefinition[] {
  const cached = state.inputFieldsCache.get(typeName);
  if (cached) return cached;

  if (typeName.endsWith("Select")) {
    const modelName = typeName.replace(/Select$/, "");
    const fields = generateSelectFields(state, modelName);
    state.inputFieldsCache.set(typeName, fields);
    return fields;
  }

  if (typeName.endsWith("Include")) {
    const modelName = typeName.replace(/Include$/, "");
    const fields = generateIncludeFields(state, modelName);
    state.inputFieldsCache.set(typeName, fields);
    return fields;
  }

  if (typeName.includes("$") && typeName.endsWith("Args")) {
    const match = typeName.match(/^(.+?)\$(.+?)Args$/);
    if (match) {
      const [, parentModel, relationField] = match;
      const model = state.dmmf.datamodel.models.find(
        (m) => m.name === parentModel
      );
      const field = model?.fields.find((f) => f.name === relationField);

      if (field && field.kind === "object") {
        const relatedSelectType = `${field.type}Select`;
        const relatedIncludeType = `${field.type}Include`;
        const relatedWhereType = `${field.type}WhereInput`;

        const argsFields: FieldDefinition[] = [
          {
            name: "select",
            type: relatedSelectType,
            isRelation: false,
            inputTypes: [
              {
                type: relatedSelectType,
                isList: false,
                kind: "object",
                location: "inputObjectTypes"
              }
            ],
            objectTypeName: relatedSelectType
          },
          {
            name: "include",
            type: relatedIncludeType,
            isRelation: false,
            inputTypes: [
              {
                type: relatedIncludeType,
                isList: false,
                kind: "object",
                location: "inputObjectTypes"
              }
            ],
            objectTypeName: relatedIncludeType
          }
        ];

        if (field.isList) {
          argsFields.push(
            {
              name: "where",
              type: relatedWhereType,
              isRelation: false,
              inputTypes: [
                {
                  type: relatedWhereType,
                  isList: false,
                  kind: "object",
                  location: "inputObjectTypes"
                }
              ],
              objectTypeName: relatedWhereType
            },
            {
              name: "orderBy",
              type: `${field.type}OrderByWithRelationInput`,
              isRelation: false,
              inputTypes: [
                {
                  type: `${field.type}OrderByWithRelationInput`,
                  isList: true,
                  kind: "object",
                  location: "inputObjectTypes"
                }
              ],
              objectTypeName: `${field.type}OrderByWithRelationInput`
            },
            {
              name: "take",
              type: "Int",
              isRelation: false,
              inputTypes: [
                {
                  type: "Int",
                  isList: false,
                  kind: "scalar",
                  location: "scalar"
                }
              ],
              objectTypeName: null
            },
            {
              name: "skip",
              type: "Int",
              isRelation: false,
              inputTypes: [
                {
                  type: "Int",
                  isList: false,
                  kind: "scalar",
                  location: "scalar"
                }
              ],
              objectTypeName: null
            }
          );
        }

        state.inputFieldsCache.set(typeName, argsFields);
        return argsFields;
      }
    }
  }

  const t = state.inputTypeMap.get(typeName);
  if (!t?.fields) {
    const empty: FieldDefinition[] = [];
    state.inputFieldsCache.set(typeName, empty);
    return empty;
  }

  const fields: FieldDefinition[] = [];

  for (const f of t.fields as DMMF.SchemaArg[]) {
    const refs = toInputTypeRefs(f?.inputTypes ?? []);
    const objectTypeName = pickObjectTypeName(refs);
    const isExpandable = Boolean(objectTypeName);

    fields.push({
      name: String(f?.name ?? ""),
      type: typeLabelFromRefs(refs),
      isRelation: isExpandable,
      isList: refs.some((r) => r.isList),
      relationModel: objectTypeName ?? undefined,
      inputTypes: refs,
      objectTypeName
    });
  }

  const cleaned = fields.filter((x) => x.name);
  state.inputFieldsCache.set(typeName, cleaned);
  return cleaned;
}

function getOperationArgsFromRootField(
  state: ParserState,
  rootFieldName: string
): ArgDefinition[] {
  const field = state.rootFieldMap.get(rootFieldName);

  if (!field?.args) return [];

  const out: ArgDefinition[] = [];

  for (const a of field.args as DMMF.SchemaArg[]) {
    const refs = toInputTypeRefs(a?.inputTypes ?? []);
    const objectTypeName = pickObjectTypeName(refs);

    out.push({
      name: String(a?.name ?? ""),
      type: typeLabelFromRefs(refs),
      isRequired: Boolean(a?.isRequired),
      isNullable: !Boolean(a?.isRequired),
      inputTypes: refs,
      objectTypeName,
      fields: objectTypeName
        ? getInputTypeFields(state, objectTypeName)
        : undefined
    });
  }

  return out.filter((x) => x.name);
}

function shouldHaveSelectInclude(method: string): boolean {
  const methodsWithSelectInclude = [
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "findMany",
    "create",
    "createManyAndReturn",
    "update",
    "updateManyAndReturn",
    "upsert",
    "delete"
  ];
  return methodsWithSelectInclude.includes(method);
}

function addSelectIncludeArgs(
  state: ParserState,
  modelName: string,
  baseArgs: ArgDefinition[]
): ArgDefinition[] {
  const selectTypeName = `${modelName}Select`;
  const includeTypeName = `${modelName}Include`;

  const selectArg: ArgDefinition = {
    name: "select",
    type: selectTypeName,
    isRequired: false,
    isNullable: true,
    inputTypes: [
      {
        type: selectTypeName,
        isList: false,
        kind: "object",
        location: "inputObjectTypes"
      }
    ],
    objectTypeName: selectTypeName,
    fields: generateSelectFields(state, modelName)
  };

  const includeArg: ArgDefinition = {
    name: "include",
    type: includeTypeName,
    isRequired: false,
    isNullable: true,
    inputTypes: [
      {
        type: includeTypeName,
        isList: false,
        kind: "object",
        location: "inputObjectTypes"
      }
    ],
    objectTypeName: includeTypeName,
    fields: generateIncludeFields(state, modelName)
  };

  return [selectArg, includeArg, ...baseArgs];
}

function getOperations(state: ParserState): Operation[] {
  const ops: Operation[] = [];
  const modelOps = (state.dmmf.mappings as any)?.modelOperations ?? [];

  for (const mo of modelOps) {
    const modelName = String(mo?.model ?? "");
    if (!modelName) continue;

    for (const [clientMethod, rootFieldName] of Object.entries(mo)) {
      if (clientMethod === "model" || clientMethod === "plural") continue;
      if (typeof rootFieldName !== "string" || !rootFieldName) continue;

      const type: OperationType = state.queryFieldSet.has(rootFieldName)
        ? "read"
        : state.mutationFieldSet.has(rootFieldName)
          ? "write"
          : isReadAction(clientMethod)
            ? "read"
            : "write";

      let args = getOperationArgsFromRootField(state, rootFieldName);

      if (shouldHaveSelectInclude(clientMethod)) {
        args = addSelectIncludeArgs(state, modelName, args);
      }

      ops.push({
        type,
        model: modelName,
        method: clientMethod,
        args
      });
    }
  }

  ops.sort((a, b) => {
    if (a.model !== b.model) return a.model.localeCompare(b.model);
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.method.localeCompare(b.method);
  });

  return ops;
}

export function createDMMFParser(dmmf: DMMFData) {
  const state = createParserState(dmmf);

  return {
    getOperations: () => getOperations(state),
    getInputTypeFields: (typeName: string) =>
      getInputTypeFields(state, typeName),
    getEnumValues: (enumName: string) => getEnumValues(state, enumName)
  };
}

export type DMMFParser = ReturnType<typeof createDMMFParser>;