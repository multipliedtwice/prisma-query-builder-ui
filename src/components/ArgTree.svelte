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
  import { isPlainObject } from "../lib/helpers.ts";
  import {
    isObjectRef,
    isEnumRef,
    isScalarRef,
    hasEnumType,
    getEnumTypeName,
  } from "../lib/dmmf-utils.ts";

  let {
    operation,
    parser,
    queryState,
    onaddarg,
    ontogglefield,
    onbreadcrumbclick,
    onaddarrayitem,
    onremovearrayitem,
  }: {
    operation: Operation;
    parser: DMMFParser;
    queryState: QueryState;
    onaddarg: (argName: string | string[], initialValue?: PayloadValue) => void;
    ontogglefield: (detail: {
      field: string;
      value: PayloadValue | undefined;
    }) => void;
    onbreadcrumbclick: (index: number) => void;
    onaddarrayitem: (arrayPath: string[]) => void;
    onremovearrayitem: (arrayPath: string[], index: number) => void;
  } = $props();

  type EnumOption = {
    name: string;
    value: string;
  };

  function handleCardKeydown(callback: () => void) {
    return (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        callback();
      }
    };
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
    let currentIsListOnly = isListOnlyArg(topArg.inputTypes ?? []);

    for (let i = 0; i < rest.length; i++) {
      const segment = rest[i];

      if (currentIsListOnly && /^\d+$/.test(segment)) {
        currentIsListOnly = false;
        continue;
      }

      if (!currentType) return null;

      const fields = parser.getInputTypeFields(currentType);
      currentField = fields.find((f) => f.name === segment);
      if (!currentField) return null;

      currentType = currentField.objectTypeName ?? null;
      currentIsListOnly = isListOnlyField(currentField.inputTypes ?? []);
    }

    return {
      field: currentField,
      objectTypeName: currentType,
      enumTypeName: currentField
        ? getEnumTypeName(currentField.inputTypes ?? [])
        : null,
    };
  }

  function getCurrentContext(): ArgContext {
    if (queryState.path.length === 0) return null;

    const node = resolveNodeAtPath();
    if (node?.objectTypeName) {
      const typeName = node.objectTypeName;
      if (typeName.endsWith("Select")) return "select";
      if (typeName.endsWith("Include")) return "include";
      if (
        typeName.includes("WhereInput") ||
        typeName.includes("WhereUniqueInput") ||
        typeName.includes("Filter") ||
        typeName.includes("ListRelationFilter")
      )
        return "where";
      if (typeName.includes("OrderBy")) return "orderBy";
      if (
        typeName.includes("CreateInput") ||
        typeName.includes("CreateMany") ||
        typeName.includes("UpdateInput") ||
        typeName.includes("UpdateMany") ||
        typeName.includes("UncheckedCreate") ||
        typeName.includes("UncheckedUpdate")
      )
        return "data";
    }

    const lastSegment = queryState.path[queryState.path.length - 1];
    if (lastSegment === "where") return "where";
    if (lastSegment === "data") return "data";
    if (lastSegment === "orderBy") return "orderBy";
    if (lastSegment === "select") return "select";
    if (lastSegment === "include") return "include";

    return null;
  }

  function defaultScalarValue(typeName: string): PayloadValue {
    const t = typeName.trim();
    if (t === "Boolean") return false;
    if (t === "Int" || t === "Float" || t === "BigInt" || t === "Decimal")
      return 0;
    if (t === "DateTime") return new Date().toISOString();
    return "";
  }

  function isListOnlyField(refs: DmmfInputTypeRef[]): boolean {
    const objectRefs = refs.filter((r) => r.type && isObjectRef(r));
    if (objectRefs.length === 0) return false;
    return objectRefs.every((r) => r.isList);
  }

  function isListOnlyArg(refs: DmmfInputTypeRef[]): boolean {
    return isListOnlyField(refs);
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
    if (isList) {
      const listRef = refs.find((r) => r.isList);
      if (listRef && isObjectRef(listRef)) return [{}];
      if (listRef && isEnumRef(listRef)) {
        const enumValues = parser.getEnumValues(listRef.type);
        return enumValues.length > 0 ? [enumValues[0]] : [];
      }
      if (listRef && isScalarRef(listRef)) {
        return [defaultScalarValue(listRef.type)];
      }
      return [];
    }

    const hasEnum = hasEnumType(refs);

    if (hasEnum) {
      const enumRef = refs.find((r) => r.type && isEnumRef(r));
      if (enumRef) {
        const enumValues = parser.getEnumValues(enumRef.type);
        return enumValues.length > 0 ? enumValues[0] : "";
      }
    }

    const objectRef = refs.find((r) => r.type && isObjectRef(r));
    const scalarRef = refs.find((r) => r.type && isScalarRef(r));

    if (context === "where") {
      if (objectRef) {
        const fields = parser.getInputTypeFields(objectRef.type);
        if (fields.length > 0) return {};
      }
      if (scalarRef && !objectRef) return defaultScalarValue(scalarRef.type);
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

  let currentNodePayload = $derived.by(() => {
    let current: any = queryState.payload;

    for (const key of queryState.path) {
      if (current === null || typeof current !== "object") return null;
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        current = current[parseInt(key, 10)];
      } else {
        if (current[key] === undefined) return null;
        current = current[key];
      }
    }

    if (current === null || typeof current !== "object") return null;
    return current;
  });

  function getCurrentPathValue(): PayloadValue | undefined {
    if (queryState.path.length === 0) return undefined;

    let current: any = queryState.payload;
    for (const key of queryState.path) {
      if (current === null || typeof current !== "object") return undefined;
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        current = current[parseInt(key, 10)];
      } else {
        if (current[key] === undefined) return undefined;
        current = current[key];
      }
    }
    return current as PayloadValue;
  }

  function getFieldValue(fieldName: string): any {
    if (!currentNodePayload) return undefined;
    return (currentNodePayload as any)[fieldName];
  }

  function getArgValue(argName: string): any {
    return (queryState.payload as any)[argName];
  }

  function getCurrentEnumOptions(): EnumOption[] | null {
    const node = resolveNodeAtPath();
    if (!node?.enumTypeName) return null;

    const ctx = getCurrentContext();
    if (node.objectTypeName && ctx === "where") return null;

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

  function fieldHasChildren(field: FieldDefinition): boolean {
    const refs = field.inputTypes ?? [];

    const hasObject = refs.some((r) => r.type && isObjectRef(r));
    if (!hasObject) return false;

    const objectTypeName = field.objectTypeName;
    if (!objectTypeName) return false;

    const childFields = parser.getInputTypeFields(objectTypeName);
    return childFields.length > 0;
  }

  function fieldIsNavigable(field: FieldDefinition): boolean {
    if (!fieldHasChildren(field)) return false;
    const refs = field.inputTypes ?? [];
    return !isListOnlyField(refs);
  }

  function fieldIsListOnlyNavigable(field: FieldDefinition): boolean {
    if (!fieldHasChildren(field)) return false;
    const refs = field.inputTypes ?? [];
    return isListOnlyField(refs);
  }

  function fieldIsEnum(field: FieldDefinition): boolean {
    const refs = field.inputTypes ?? [];
    if (!hasEnumType(refs)) return false;

    const enumTypeName = getEnumTypeName(refs);
    if (!enumTypeName) return false;
    return parser.getEnumValues(enumTypeName).length > 0;
  }

  function fieldIsListOnly(field: FieldDefinition): boolean {
    const refs = field.inputTypes ?? [];
    return isListOnlyField(refs);
  }

  function argHasChildren(arg: ArgDefinition): boolean {
    const refs = arg.inputTypes ?? [];

    const hasObject = refs.some((r) => r.type && isObjectRef(r));
    if (!hasObject) return false;

    const objectTypeName = arg.objectTypeName;
    if (!objectTypeName) return false;

    const childFields = parser.getInputTypeFields(objectTypeName);
    return childFields.length > 0;
  }

  function argIsNavigable(arg: ArgDefinition): boolean {
    if (!argHasChildren(arg)) return false;
    const refs = arg.inputTypes ?? [];
    return !isListOnlyArg(refs);
  }

  function argIsListOnlyNavigable(arg: ArgDefinition): boolean {
    if (!argHasChildren(arg)) return false;
    const refs = arg.inputTypes ?? [];
    return isListOnlyArg(refs);
  }

  function argIsEnum(arg: ArgDefinition): boolean {
    const refs = arg.inputTypes ?? [];
    if (!hasEnumType(refs)) return false;

    const enumTypeName = getEnumTypeName(refs);
    if (!enumTypeName) return false;
    return parser.getEnumValues(enumTypeName).length > 0;
  }

  function argIsListOnly(arg: ArgDefinition): boolean {
    const refs = arg.inputTypes ?? [];
    return isListOnlyArg(refs);
  }

  function shouldPreferExpand(
    hasChildren: boolean,
    isNavigable: boolean,
    isEnum: boolean,
    ctx: ArgContext,
  ): boolean {
    if (!hasChildren) return false;
    if (!isNavigable) return false;
    if (isEnum && ctx !== "where") return false;
    return true;
  }

  let isAtArrayLevel = $derived.by(() => {
    if (queryState.path.length === 0) return false;
    const lastSegment = queryState.path[queryState.path.length - 1];
    if (/^\d+$/.test(lastSegment)) return false;

    const [first, ...rest] = queryState.path;
    const topArg = operation.args.find((a) => a.name === first);
    if (!topArg) return false;

    if (rest.length === 0) {
      return isListOnlyArg(topArg.inputTypes ?? []);
    }

    let currentType = topArg.objectTypeName ?? null;
    let currentIsListOnly = isListOnlyArg(topArg.inputTypes ?? []);

    for (let i = 0; i < rest.length; i++) {
      const segment = rest[i];
      if (currentIsListOnly && /^\d+$/.test(segment)) {
        currentIsListOnly = false;
        continue;
      }
      if (!currentType) return false;
      const fields = parser.getInputTypeFields(currentType);
      const field = fields.find((f) => f.name === segment);
      if (!field) return false;
      currentType = field.objectTypeName ?? null;
      currentIsListOnly = isListOnlyField(field.inputTypes ?? []);
    }

    return currentIsListOnly;
  });

  let currentArrayValue = $derived.by((): PayloadValue[] | null => {
    if (!isAtArrayLevel) return null;
    let current: any = queryState.payload;
    for (const key of queryState.path) {
      if (current === null || typeof current !== "object") return null;
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        current = current[parseInt(key, 10)];
      } else {
        current = current[key];
      }
    }
    return Array.isArray(current) ? current : null;
  });

  let arrayInfo = $derived.by(() => {
    if (isAtArrayLevel) return null;
    for (let i = queryState.path.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(queryState.path[i])) {
        return {
          arrayPath: queryState.path.slice(0, i),
          itemIndex: parseInt(queryState.path[i], 10),
          itemPathIndex: i,
        };
      }
    }
    return null;
  });

  let arrayBarContext = $derived.by(() => {
    if (!arrayInfo) return null;
    let current: any = queryState.payload;
    for (const key of arrayInfo.arrayPath) {
      if (current === null || typeof current !== "object") return null;
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        current = current[parseInt(key, 10)];
      } else {
        current = current[key];
      }
    }
    if (!Array.isArray(current)) return null;
    return {
      currentIndex: arrayInfo.itemIndex,
      totalItems: current.length,
      arrayPath: arrayInfo.arrayPath,
    };
  });

  function navigateToArrayItem(targetIndex: number) {
    const path = isAtArrayLevel
      ? [...queryState.path]
      : (arrayInfo?.arrayPath ?? null);
    if (!path || path.length === 0) return;
    const fieldName = path[path.length - 1];
    const parentBreadcrumbIndex = path.length - 2;
    onbreadcrumbclick(parentBreadcrumbIndex);
    onaddarg([fieldName, String(targetIndex)], {});
  }

  function handleAddArrayItemFromOverview() {
    if (!isAtArrayLevel) return;
    const arrPath = [...queryState.path];
    const currentArr = currentArrayValue;
    const newIndex = currentArr ? currentArr.length : 0;
    const fieldName = arrPath[arrPath.length - 1];
    const parentBreadcrumbIndex = arrPath.length - 2;
    onaddarrayitem([...arrPath]);
    onbreadcrumbclick(parentBreadcrumbIndex);
    onaddarg([fieldName, String(newIndex)], {});
  }

  function handleAddArrayItemInline() {
    if (!arrayBarContext) return;
    onaddarrayitem([...arrayBarContext.arrayPath]);
  }

  function handleRemoveCurrentItem() {
    if (!arrayBarContext) return;
    onremovearrayitem(
      [...arrayBarContext.arrayPath],
      arrayBarContext.currentIndex,
    );
  }

  function handleArgClick(arg: ArgDefinition) {
    const hasChildren = argHasChildren(arg);
    const isNavigable = argIsNavigable(arg);
    const isListNav = argIsListOnlyNavigable(arg);
    const isEnum = argIsEnum(arg);
    const isListTyped = argIsListOnly(arg);
    const currentValue = getArgValue(arg.name);
    const ctx = getCurrentContext();

    if (isListNav) {
      if (
        currentValue !== undefined &&
        Array.isArray(currentValue) &&
        currentValue.length > 0
      ) {
        onaddarg([arg.name, "0"], currentValue[0] as PayloadValue);
      } else {
        ontogglefield({ field: arg.name, value: [{}] });
        onaddarg([arg.name, "0"], {});
      }
      return;
    }

    if (isListTyped) {
      if (currentValue !== undefined) {
        ontogglefield({ field: arg.name, value: undefined });
      } else {
        const defaultValue = defaultValueForInputTypes(arg.inputTypes, ctx);
        ontogglefield({ field: arg.name, value: defaultValue });
      }
      return;
    }

    if (shouldPreferExpand(hasChildren, isNavigable, isEnum, ctx)) {
      if (
        currentValue !== undefined &&
        isPlainObject(currentValue as unknown)
      ) {
        onaddarg(arg.name, currentValue as PayloadValue);
      } else {
        ontogglefield({ field: arg.name, value: {} });
        onaddarg(arg.name, {});
      }
      return;
    }

    if (isEnum) {
      if (currentValue !== undefined) {
        onaddarg(arg.name, currentValue);
      } else {
        const defaultValue = defaultValueForInputTypes(arg.inputTypes, ctx);
        ontogglefield({ field: arg.name, value: defaultValue });
        onaddarg(arg.name, defaultValue);
      }
      return;
    }

    if (currentValue !== undefined) {
      ontogglefield({ field: arg.name, value: undefined });
    } else {
      const defaultValue = defaultValueForInputTypes(arg.inputTypes, ctx);
      ontogglefield({ field: arg.name, value: defaultValue });
    }
  }

  function handleArgButtonClick(arg: ArgDefinition, event: MouseEvent) {
    event.stopPropagation();
    const currentValue = getArgValue(arg.name);
    const ctx = getCurrentContext();

    if (currentValue === undefined) {
      const isNavigable = argIsNavigable(arg);
      const isListNav = argIsListOnlyNavigable(arg);
      const isListTyped = argIsListOnly(arg);
      const hasChildren = argHasChildren(arg);
      const isEnum = argIsEnum(arg);

      if (isListNav || isListTyped) {
        const defaultValue = defaultValueForInputTypes(arg.inputTypes, ctx);
        ontogglefield({ field: arg.name, value: defaultValue });
      } else if (shouldPreferExpand(hasChildren, isNavigable, isEnum, ctx)) {
        ontogglefield({ field: arg.name, value: {} });
      } else if (isEnum) {
        const defaultValue = defaultValueForInputTypes(arg.inputTypes, ctx);
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
    const isNavigable = fieldIsNavigable(field);
    const isListNav = fieldIsListOnlyNavigable(field);
    const isEnum = fieldIsEnum(field);
    const isListTyped = fieldIsListOnly(field);
    const currentValue = getFieldValue(field.name);
    const ctx = getCurrentContext();

    if (isListNav) {
      if (
        currentValue !== undefined &&
        Array.isArray(currentValue) &&
        currentValue.length > 0
      ) {
        onaddarg([field.name, "0"], currentValue[0] as PayloadValue);
      } else {
        ontogglefield({ field: field.name, value: [{}] });
        onaddarg([field.name, "0"], {});
      }
      return;
    }

    if (isListTyped) {
      if (currentValue !== undefined) {
        ontogglefield({ field: field.name, value: undefined });
      } else {
        const defaultValue = defaultValueForInputTypes(field.inputTypes, ctx);
        ontogglefield({ field: field.name, value: defaultValue });
      }
      return;
    }

    if (shouldPreferExpand(hasChildren, isNavigable, isEnum, ctx)) {
      if (
        currentValue !== undefined &&
        isPlainObject(currentValue as unknown)
      ) {
        onaddarg(field.name, currentValue as PayloadValue);
      } else {
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

    if (isEnum) {
      if (currentValue !== undefined) {
        onaddarg(field.name, currentValue);
      } else {
        const defaultValue = defaultValueForInputTypes(field.inputTypes, ctx);
        ontogglefield({ field: field.name, value: defaultValue });
        onaddarg(field.name, defaultValue);
      }
      return;
    }

    if (currentValue !== undefined) {
      ontogglefield({ field: field.name, value: undefined });
    } else {
      if (ctx === "select" || ctx === "include") {
        ontogglefield({ field: field.name, value: true });
      } else {
        const defaultValue = defaultValueForInputTypes(field.inputTypes, ctx);
        ontogglefield({ field: field.name, value: defaultValue });
      }
    }
  }

  function handleFieldButtonClick(field: FieldDefinition, event: MouseEvent) {
    event.stopPropagation();
    const currentValue = getFieldValue(field.name);
    const ctx = getCurrentContext();

    if (currentValue === undefined) {
      const isNavigable = fieldIsNavigable(field);
      const isListNav = fieldIsListOnlyNavigable(field);
      const isListTyped = fieldIsListOnly(field);
      const hasChildren = fieldHasChildren(field);
      const isEnum = fieldIsEnum(field);

      if (isListNav || isListTyped) {
        const defaultValue = defaultValueForInputTypes(field.inputTypes, ctx);
        ontogglefield({ field: field.name, value: defaultValue });
      } else if (shouldPreferExpand(hasChildren, isNavigable, isEnum, ctx)) {
        if ((ctx === "select" || ctx === "include") && field.isRelation) {
          ontogglefield({ field: field.name, value: { select: {} } });
        } else {
          ontogglefield({ field: field.name, value: {} });
        }
      } else if (isEnum) {
        const defaultValue = defaultValueForInputTypes(field.inputTypes, ctx);
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
        {segment.match(/^\d+$/) ? `[${segment}]` : segment}
      </Button>
    {/each}
  </div>

  {#if arrayBarContext}
    <div
      class="h-[40px] shrink-0 flex items-center gap-2 px-4 border-b border-border text-sm"
    >
      <Button
        variant="ghost"
        size="sm"
        class="h-7 px-2"
        disabled={arrayBarContext.currentIndex === 0}
        onclick={() => navigateToArrayItem(arrayBarContext.currentIndex - 1)}
      >
        ←
      </Button>
      <span class="text-muted-foreground text-xs">
        Item {arrayBarContext.currentIndex + 1} of {arrayBarContext.totalItems}
      </span>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 px-2"
        disabled={arrayBarContext.currentIndex >=
          arrayBarContext.totalItems - 1}
        onclick={() => navigateToArrayItem(arrayBarContext.currentIndex + 1)}
      >
        →
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 px-2"
        onclick={handleAddArrayItemInline}
      >
        +
      </Button>
      {#if arrayBarContext.totalItems > 1}
        <Button
          variant="ghost"
          size="sm"
          class="h-7 px-2"
          onclick={handleRemoveCurrentItem}
        >
          −
        </Button>
      {/if}
    </div>
  {/if}

  <div class="flex-1 overflow-y-auto p-4">
    {#if isAtArrayLevel && currentArrayValue}
      <div class="space-y-4">
        <div
          class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
        >
          Items ({currentArrayValue.length})
        </div>
        <div class="space-y-2">
          {#each currentArrayValue as item, i}
            {@const fieldCount = isPlainObject(item)
              ? Object.keys(item).length
              : 0}
            <Card
              class="p-3 cursor-pointer transition-colors hover:border-primary/50"
              onclick={() => navigateToArrayItem(i)}
              onkeydown={handleCardKeydown(() => navigateToArrayItem(i))}
              role="button"
              tabindex={0}
            >
              <div class="flex items-center justify-between">
                <span class="font-medium">Item {i + 1}</span>
                <span class="text-xs text-muted-foreground font-mono">
                  {fieldCount}
                  {fieldCount === 1 ? "field" : "fields"}
                </span>
              </div>
            </Card>
          {/each}
        </div>
        <Button
          variant="outline"
          size="sm"
          onclick={handleAddArrayItemFromOverview}
        >
          + Add Item
        </Button>
      </div>
    {:else if currentEnumOptions}
      <div class="space-y-4">
        <div
          class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
        >
          Enum Values
        </div>
        <div class="space-y-2">
          {#each currentEnumOptions as option}
            {@const currentValue = getCurrentPathValue()}
            {@const isSelected = currentValue === option.value}
            <Card
              class={`p-3 cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
              onclick={() => handleEnumOptionClick(option)}
              onkeydown={handleCardKeydown(() => handleEnumOptionClick(option))}
              role="button"
              tabindex={0}
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
    {:else if currentFields}
      <div class="space-y-4">
        <div
          class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
        >
          Fields
        </div>

        {#if currentFields.length === 0}
          <p class="text-sm text-muted-foreground">No fields available</p>
        {:else}
          <div class="space-y-2">
            {#each currentFields as field}
              {@const v = getFieldValue(field.name)}
              {@const hasChildren = fieldHasChildren(field)}
              {@const isEnum = fieldIsEnum(field)}
              {@const isListTyped = fieldIsListOnly(field)}
              {@const isListNav = fieldIsListOnlyNavigable(field)}
              {@const isExpandable =
                (hasChildren && !isListTyped) || isEnum || isListNav}
              {@const isActive = v !== undefined}

              <Card
                class={`p-3 cursor-pointer transition-colors ${isActive ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onclick={() => handleFieldClick(field)}
                onkeydown={handleCardKeydown(() => handleFieldClick(field))}
                role="button"
                tabindex={0}
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
                    {#if isActive && isListTyped}
                      <span
                        class="text-[10px] text-muted-foreground font-mono shrink-0"
                        >({Array.isArray(v) ? v.length : 1} item{Array.isArray(
                          v,
                        ) && v.length !== 1
                          ? "s"
                          : ""})</span
                      >
                    {:else if (context === "select" || context === "include") && v === true}
                      <span
                        class="text-[10px] text-muted-foreground font-mono shrink-0"
                        >true</span
                      >
                    {:else if isActive && isEnum && !hasChildren}
                      <span
                        class="text-[10px] text-muted-foreground font-mono shrink-0"
                        >= {v}</span
                      >
                    {/if}
                    {#if !isExpandable && !isListTyped && field.objectTypeName}
                      <span
                        class="text-[10px] text-muted-foreground italic shrink-0"
                        >(no fields)</span
                      >
                    {/if}
                  </div>

                  {#if isExpandable || isListTyped}
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
            {@const isListTyped = argIsListOnly(arg)}
            {@const isListNav = argIsListOnlyNavigable(arg)}
            {@const isExpandable =
              (hasChildren && !isListTyped) || isEnum || isListNav}
            {@const v = getArgValue(arg.name)}
            {@const isActive = v !== undefined}

            <Card
              class={`p-3 cursor-pointer transition-colors ${isActive ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
              onclick={() => handleArgClick(arg)}
              onkeydown={handleCardKeydown(() => handleArgClick(arg))}
              role="button"
              tabindex={0}
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
                  {#if isActive && isListTyped}
                    <span
                      class="text-[10px] text-muted-foreground font-mono shrink-0"
                      >({Array.isArray(v) ? v.length : 1} item{Array.isArray(
                        v,
                      ) && v.length !== 1
                        ? "s"
                        : ""})</span
                    >
                  {:else if isActive && isEnum && !hasChildren}
                    <span
                      class="text-[10px] text-muted-foreground font-mono shrink-0"
                      >= {v}</span
                    >
                  {/if}
                  {#if !isExpandable && !isListTyped && arg.objectTypeName}
                    <span
                      class="text-[10px] text-muted-foreground italic shrink-0"
                      >(no fields)</span
                    >
                  {/if}
                </div>
                {#if isExpandable || isListTyped}
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
