<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import { Card } from "$lib/components/ui/card/index.js";
  import type { DMMFParser } from "../lib/dmmf-parser.ts";
  import type {
    Operation,
    QueryState,
    ArgDefinition,
    FieldDefinition,
    ArgContext,
    PayloadValue,
    DmmfInputTypeRef,
  } from "../lib/types.ts";

  let {
    operation,
    parser,
    queryState,
    onaddarg,
    ontogglefield,
    onbreadcrumbclick,
  }: {
    operation: Operation;
    parser: DMMFParser;
    queryState: QueryState;
    onaddarg: (argName: string, initialValue?: PayloadValue) => void;
    ontogglefield: (detail: {
      field: string;
      value: PayloadValue | undefined;
    }) => void;
    onbreadcrumbclick: (index: number) => void;
  } = $props();

  type EnumOption = {
    name: string;
    value: string;
  };

  function getCurrentContext(): ArgContext {
    if (queryState.path.length === 0) return null;

    const firstArg = queryState.path[0];
    if (firstArg === "select") return "select";
    if (firstArg === "include") return "include";
    if (firstArg === "where") return "where";
    if (firstArg === "data") return "data";
    if (firstArg === "orderBy") return "orderBy";

    return null;
  }

  function isObjectRef(r: DmmfInputTypeRef): boolean {
    const loc = (r.location ?? "").toLowerCase();
    const kind = (r.kind ?? "").toLowerCase();
    if (kind === "object") return true;
    if (loc.includes("inputobject")) return true;
    if (loc === "inputobjecttypes") return true;
    return false;
  }

  function isEnumRef(r: DmmfInputTypeRef): boolean {
    const loc = (r.location ?? "").toLowerCase();
    const kind = (r.kind ?? "").toLowerCase();
    if (kind === "enum") return true;
    if (loc.includes("enum")) return true;
    if (loc === "enumtypes") return true;
    return false;
  }

  function isScalarRef(r: DmmfInputTypeRef): boolean {
    const loc = (r.location ?? "").toLowerCase();
    const kind = (r.kind ?? "").toLowerCase();
    if (kind === "scalar") return true;
    if (loc === "scalar") return true;
    return !isObjectRef(r) && !isEnumRef(r);
  }

  function getEnumTypeName(refs: DmmfInputTypeRef[]): string | null {
    const enumRef = refs.find((r) => r.type && isEnumRef(r));
    return enumRef?.type ?? null;
  }

  function hasEnumType(refs: DmmfInputTypeRef[]): boolean {
    return refs.some((r) => r.type && isEnumRef(r));
  }

  function hasObjectType(refs: DmmfInputTypeRef[]): boolean {
    return refs.some((r) => r.type && isObjectRef(r));
  }

  function defaultScalarValue(typeName: string): PayloadValue {
    const t = typeName.trim();
    if (t === "Boolean") return false;
    if (t === "Int" || t === "Float" || t === "BigInt" || t === "Decimal")
      return 0;
    if (t === "DateTime") return new Date().toISOString();
    return "";
  }

  function defaultValueForInputTypes(
    inputTypes?: DmmfInputTypeRef[],
    context?: ArgContext,
  ): PayloadValue {
    const refs = inputTypes ?? [];

    if (context === "select" || context === "include") {
      return true;
    }

    const typeGroups = new Map<string, { list: boolean; nonList: boolean }>();
    for (const ref of refs) {
      const existing = typeGroups.get(ref.type) || {
        list: false,
        nonList: false,
      };
      if (ref.isList) {
        existing.list = true;
      } else {
        existing.nonList = true;
      }
      typeGroups.set(ref.type, existing);
    }

    for (const [typeName, versions] of typeGroups) {
      if (versions.list && versions.nonList) {
        const listRef = refs.find((r) => r.type === typeName && r.isList);
        if (!listRef) continue;

        if (isObjectRef(listRef)) {
          return [{}];
        }
        if (isEnumRef(listRef)) {
          const enumValues = parser.getEnumValues(typeName);
          return enumValues.length > 0 ? [enumValues[0]] : [];
        }
        if (isScalarRef(listRef)) {
          return [defaultScalarValue(typeName)];
        }
      }
    }

    const isList = refs.some((r) => r.isList);
    if (isList) return [];

    const hasEnum = hasEnumType(refs);
    const hasObject = hasObjectType(refs);

    if (hasEnum) {
      const enumRef = refs.find((r) => r.type && isEnumRef(r));
      if (enumRef) {
        const enumValues = parser.getEnumValues(enumRef.type);
        return enumValues.length > 0 ? enumValues[0] : "";
      }
    }

    const objectRef = refs.find((r) => r.type && isObjectRef(r));
    const scalarRef = refs.find((r) => r.type && isScalarRef(r));

    // FIXED: For where context, handle filter objects vs scalar values properly
    if (context === "where") {
      // If it has object types (like StringFilter), prefer that
      if (objectRef) {
        const fields = parser.getInputTypeFields(objectRef.type);
        // Only return {} if it actually has fields to expand
        if (fields.length > 0) return {};
      }
      // For direct scalar filters (leaf values like not, equals, etc.)
      // Don't set a default - let user provide the value
      if (scalarRef && !objectRef) return null;
      return {};
    }

    if (context === "orderBy") {
      if (objectRef) return {};
      if (scalarRef) return defaultScalarValue(scalarRef.type);
      return {};
    }

    if (context === "data") {
      if (objectRef) return {};
      if (scalarRef) return defaultScalarValue(scalarRef.type);
      return "";
    }

    if (objectRef) return {};
    if (scalarRef) return defaultScalarValue(scalarRef.type);
    return "";
  }

  function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  let currentNodePayload = $derived.by(() => {
    let current: any = queryState.payload;

    for (const key of queryState.path) {
      if (current === null || typeof current !== "object") return null;
      if (current[key] === undefined) return null;
      current = current[key];
    }

    if (current === null || typeof current !== "object") return null;
    return current;
  });

  function getFieldValue(fieldName: string): any {
    if (!currentNodePayload) return undefined;
    return (currentNodePayload as any)[fieldName];
  }

  function getArgValue(argName: string): any {
    return (queryState.payload as any)[argName];
  }

  function resolveNodeAtPath(): {
    arg?: ArgDefinition;
    field?: FieldDefinition;
    objectTypeName?: string | null;
    enumTypeName?: string | null;
  } | null {
    if (queryState.path.length === 0) return null;

    const [first, ...rest] = queryState.path;
    const topArg = operation.args.find((a) => a.name === first);
    if (!topArg) return null;

    if (rest.length === 0) {
      return {
        arg: topArg,
        objectTypeName: topArg.objectTypeName ?? null,
        enumTypeName: getEnumTypeName(topArg.inputTypes ?? []),
      };
    }

    let currentType = topArg.objectTypeName ?? null;
    let currentField: FieldDefinition | undefined;

    for (let i = 0; i < rest.length; i++) {
      if (!currentType) return null;

      const fields = parser.getInputTypeFields(currentType);
      currentField = fields.find((f) => f.name === rest[i]);
      if (!currentField) return null;

      currentType = currentField.objectTypeName ?? null;
    }

    return {
      field: currentField,
      objectTypeName: currentType,
      enumTypeName: currentField
        ? getEnumTypeName(currentField.inputTypes ?? [])
        : null,
    };
  }

  function getCurrentEnumOptions(): EnumOption[] | null {
    const node = resolveNodeAtPath();
    if (!node?.enumTypeName) return null;

    const values = parser.getEnumValues(node.enumTypeName);
    return values.map((v) => ({ name: v, value: v }));
  }

  function getCurrentFields(): FieldDefinition[] | null {
    const node = resolveNodeAtPath();
    if (!node) return null;

    const typeName = node.objectTypeName;
    if (!typeName) return null;

    return parser.getInputTypeFields(typeName);
  }

  function getAvailableArgs(): ArgDefinition[] {
    if (queryState.path.length === 0) return operation.args;
    return [];
  }

  function shouldShowField(
    _field: FieldDefinition,
    _context: ArgContext,
  ): boolean {
    return true;
  }

  function fieldHasChildren(field: FieldDefinition): boolean {
    const refs = field.inputTypes ?? [];

    if (hasEnumType(refs)) return false;

    const hasObject = refs.some((r) => r.type && isObjectRef(r));
    if (!hasObject) return false;

    const objectTypeName = field.objectTypeName;
    if (!objectTypeName) return false;

    const childFields = parser.getInputTypeFields(objectTypeName);
    return childFields.length > 0;
  }

  function fieldIsEnum(field: FieldDefinition): boolean {
    const refs = field.inputTypes ?? [];
    if (!hasEnumType(refs)) return false;

    const enumTypeName = getEnumTypeName(refs);
    if (!enumTypeName) return false;
    return parser.getEnumValues(enumTypeName).length > 0;
  }

  function argHasChildren(arg: ArgDefinition): boolean {
    const refs = arg.inputTypes ?? [];

    if (hasEnumType(refs)) return false;

    const hasObject = refs.some((r) => r.type && isObjectRef(r));
    if (!hasObject) return false;

    const objectTypeName = arg.objectTypeName;
    if (!objectTypeName) return false;

    const childFields = parser.getInputTypeFields(objectTypeName);
    return childFields.length > 0;
  }

  function argIsEnum(arg: ArgDefinition): boolean {
    const refs = arg.inputTypes ?? [];
    if (!hasEnumType(refs)) return false;

    const enumTypeName = getEnumTypeName(refs);
    if (!enumTypeName) return false;
    return parser.getEnumValues(enumTypeName).length > 0;
  }

  function handleArgClick(arg: ArgDefinition) {
    const hasChildren = argHasChildren(arg);
    const isEnum = argIsEnum(arg);
    const currentValue = getArgValue(arg.name);

    if (isEnum) {
      if (currentValue !== undefined) {
        onaddarg(arg.name, currentValue);
      } else {
        const defaultValue = defaultValueForInputTypes(
          arg.inputTypes,
          getCurrentContext(),
        );
        ontogglefield({ field: arg.name, value: defaultValue });
        onaddarg(arg.name, defaultValue);
      }
      return;
    }

    if (hasChildren) {
      if (currentValue !== undefined && isPlainObject(currentValue)) {
        onaddarg(arg.name, currentValue as PayloadValue);
      } else {
        ontogglefield({ field: arg.name, value: {} });
        onaddarg(arg.name, {});
      }
      return;
    }

    if (currentValue !== undefined) {
      ontogglefield({ field: arg.name, value: undefined });
    } else {
      const defaultValue = defaultValueForInputTypes(
        arg.inputTypes,
        getCurrentContext(),
      );
      ontogglefield({ field: arg.name, value: defaultValue });
    }
  }

  function handleArgButtonClick(arg: ArgDefinition, event: MouseEvent) {
    event.stopPropagation();
    const currentValue = getArgValue(arg.name);

    if (currentValue === undefined) {
      const isEnum = argIsEnum(arg);
      if (isEnum) {
        const defaultValue = defaultValueForInputTypes(
          arg.inputTypes,
          getCurrentContext(),
        );
        ontogglefield({ field: arg.name, value: defaultValue });
      } else {
        ontogglefield({ field: arg.name, value: {} });
      }
    } else {
      ontogglefield({ field: arg.name, value: undefined });
    }
  }

  function handleFieldClick(field: FieldDefinition) {
    const hasChildren = fieldHasChildren(field);
    const isEnum = fieldIsEnum(field);
    const currentValue = getFieldValue(field.name);

    if (isEnum) {
      if (currentValue !== undefined) {
        onaddarg(field.name, currentValue);
      } else {
        const defaultValue = defaultValueForInputTypes(
          field.inputTypes,
          getCurrentContext(),
        );
        ontogglefield({ field: field.name, value: defaultValue });
        onaddarg(field.name, defaultValue);
      }
      return;
    }

    if (hasChildren) {
      if (isPlainObject(currentValue)) {
        onaddarg(field.name, currentValue as PayloadValue);
      } else {
        // FIXED: For relation fields in select/include context, initialize with select wrapper
        const ctx = getCurrentContext();
        if ((ctx === "select" || ctx === "include") && field.isRelation) {
          ontogglefield({ field: field.name, value: { select: {} } });
          onaddarg(field.name, { select: {} });
        } else {
          ontogglefield({ field: field.name, value: {} });
          onaddarg(field.name, {});
        }
      }
      return;
    }

    const ctx = getCurrentContext();
    if (currentValue !== undefined) {
      ontogglefield({ field: field.name, value: undefined });
    } else {
      if (ctx === "select" || ctx === "include") {
        ontogglefield({ field: field.name, value: true });
      } else {
        const defaultValue = defaultValueForInputTypes(field.inputTypes, ctx);
        if (defaultValue !== null) {
          ontogglefield({ field: field.name, value: defaultValue });
        } else {
          ontogglefield({ field: field.name, value: "" });
        }
      }
    }
  }

  function handleFieldButtonClick(field: FieldDefinition, event: MouseEvent) {
    event.stopPropagation();
    const currentValue = getFieldValue(field.name);

    if (currentValue === undefined) {
      const isEnum = fieldIsEnum(field);
      if (isEnum) {
        const defaultValue = defaultValueForInputTypes(
          field.inputTypes,
          getCurrentContext(),
        );
        ontogglefield({ field: field.name, value: defaultValue });
      } else {
        ontogglefield({ field: field.name, value: {} });
      }
    } else {
      ontogglefield({ field: field.name, value: undefined });
    }
  }

  function handleEnumOptionClick(option: EnumOption) {
    if (queryState.path.length === 0) return;

    const lastPathSegment = queryState.path[queryState.path.length - 1];

    onbreadcrumbclick(queryState.path.length - 2);

    ontogglefield({ field: lastPathSegment, value: option.value });
  }

  let availableArgs = $derived(getAvailableArgs());
  let currentFields = $derived(getCurrentFields());
  let currentEnumOptions = $derived(getCurrentEnumOptions());
  let context = $derived(getCurrentContext());
  let filteredFields = $derived(
    currentFields
      ? currentFields.filter((f) => shouldShowField(f, context))
      : null,
  );

  $effect(() => {
    if (operation) {
      console.log("[ArgTree Debug]", {
        method: operation.method,
        model: operation.model,
        allArgs: operation.args.map((a) => ({
          name: a.name,
          required: a.isRequired,
          type: a.type,
        })),
        hasSelect: operation.args.some((a) => a.name === "select"),
        hasInclude: operation.args.some((a) => a.name === "include"),
      });
    }
  });
</script>

<div class="@container flex flex-col h-full">
  <div
    class="h-[52px] shrink-0 flex flex-wrap items-center gap-2 px-4 border-b border-border text-sm overflow-x-auto"
  >
    <Button variant="ghost" size="sm" onclick={() => onbreadcrumbclick(-1)}>
      {operation.model}.{operation.method}
    </Button>
    {#each queryState.path as segment, i}
      <span class="text-muted-foreground">/</span>
      <Button variant="ghost" size="sm" onclick={() => onbreadcrumbclick(i)}>
        {segment}
      </Button>
    {/each}
  </div>

  <div class="flex-1 overflow-y-auto p-4">
    {#if currentEnumOptions}
      <div class="space-y-4">
        <div
          class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
        >
          Enum Values
        </div>
        <div class="space-y-2">
          {#each currentEnumOptions as option}
            {@const currentValue =
              queryState.path.length > 0
                ? getFieldValue(queryState.path[queryState.path.length - 1])
                : undefined}
            {@const isSelected = currentValue === option.value}
            <Card
              class={`p-3 cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
              onclick={() => handleEnumOptionClick(option)}
            >
              <div class="flex items-center justify-between">
                <span class="font-medium">{option.name}</span>
                {#if isSelected}
                  <span class="text-xs text-primary">✓</span>
                {/if}
              </div>
            </Card>
          {/each}
        </div>
      </div>
    {:else if filteredFields}
      <div class="space-y-4">
        <div
          class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
        >
          Fields
        </div>

        {#if filteredFields.length === 0}
          <p class="text-sm text-muted-foreground">No fields available</p>
        {:else}
          <div class="space-y-2">
            {#each filteredFields as field}
              {@const v = getFieldValue(field.name)}
              {@const hasChildren = fieldHasChildren(field)}
              {@const isEnum = fieldIsEnum(field)}
              {@const isExpandable = hasChildren || isEnum}
              {@const isActive = v !== undefined}

              <Card
                class={`p-3 cursor-pointer transition-colors ${isActive ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onclick={() => handleFieldClick(field)}
              >
                <div class="flex items-center justify-between gap-2">
                  <div
                    class="flex-1 min-w-0 flex flex-wrap @xs:flex-nowrap items-baseline gap-x-2 gap-y-0.5"
                  >
                    <span class="font-medium shrink-0">{field.name}</span>
                    <span
                      class="text-xs font-mono truncate max-w-[120px] @xs:max-w-[160px] @sm:max-w-[200px] @md:max-w-none {field.isRelation &&
                      !isEnum
                        ? 'text-primary'
                        : 'text-muted-foreground'}"
                      title={field.isRelation && !isEnum
                        ? field.relationModel
                        : field.type}
                    >
                      {field.isRelation && !isEnum
                        ? field.relationModel
                        : field.type}
                    </span>
                    {#if (context === "select" || context === "include") && v === true}
                      <span
                        class="text-[10px] text-muted-foreground font-mono shrink-0"
                        >true</span
                      >
                    {:else if isActive && isEnum}
                      <span
                        class="text-[10px] text-muted-foreground font-mono shrink-0"
                        >= {v}</span
                      >
                    {/if}
                    {#if !isExpandable && field.objectTypeName}
                      <span
                        class="text-[10px] text-muted-foreground italic shrink-0"
                        >(no fields)</span
                      >
                    {/if}
                  </div>

                  {#if isExpandable}
                    <Button
                      variant={isActive ? "default" : "secondary"}
                      size="icon"
                      class="h-6 w-6 shrink-0"
                      onclick={(e) => handleFieldButtonClick(field, e)}
                    >
                      {isActive ? "−" : "+"}
                    </Button>
                  {/if}
                </div>
              </Card>
            {/each}
          </div>
        {/if}
      </div>
    {:else if availableArgs.length > 0}
      <div class="space-y-4">
        <div
          class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
        >
          Arguments
        </div>
        <div class="space-y-2">
          {#each availableArgs as arg}
            {@const hasChildren = argHasChildren(arg)}
            {@const isEnum = argIsEnum(arg)}
            {@const isExpandable = hasChildren || isEnum}
            {@const v = getArgValue(arg.name)}
            {@const isActive = v !== undefined}

            <Card
              class={`p-3 cursor-pointer transition-colors ${isActive ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
              onclick={() => handleArgClick(arg)}
            >
              <div class="flex items-center justify-between gap-2">
                <div
                  class="flex-1 min-w-0 flex flex-wrap @xs:flex-nowrap items-baseline gap-x-2 gap-y-0.5"
                >
                  <span class="font-medium shrink-0">{arg.name}</span>
                  <span
                    class="text-xs text-muted-foreground font-mono truncate max-w-[120px] @xs:max-w-[160px] @sm:max-w-[200px] @md:max-w-none"
                    title={arg.type}
                  >
                    {arg.type}
                  </span>
                  {#if isActive && isEnum}
                    <span
                      class="text-[10px] text-muted-foreground font-mono shrink-0"
                      >= {v}</span
                    >
                  {/if}
                  {#if !isExpandable && arg.objectTypeName}
                    <span
                      class="text-[10px] text-muted-foreground italic shrink-0"
                      >(no fields)</span
                    >
                  {/if}
                </div>
                {#if isExpandable}
                  <Button
                    variant={isActive ? "default" : "secondary"}
                    size="icon"
                    class="h-6 w-6 shrink-0"
                    onclick={(e) => handleArgButtonClick(arg, e)}
                  >
                    {isActive ? "−" : "+"}
                  </Button>
                {/if}
              </div>
            </Card>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
