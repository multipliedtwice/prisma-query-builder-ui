export const QUERY_COPY = {
  workspaceLabel: "{model} saved queries",
  templates: "Saved query templates",
  newQuery: "New query",
  saveAll: "Save all",
  savedQueries: "Saved queries",
  findQuery: "Find a query",
  nameOrUsage: "Name or usage",
  operation: "Operation",
  allOperations: "All operations",
  usages: "Query usages",
  unsaved: "Unsaved changes",
  noMatching: "No matching queries.",
  noSavedYet: "No saved queries yet.",
  noSaved: "No saved queries",
  savedQuery: "Saved query",
  actions: "Actions",
  rename: "Rename",
  duplicate: "Duplicate",
  delete: "Delete",
  saving: "Saving…",
  saveQuery: "Save query",
  enabled: "Enabled",
  reviewAccept: "Review & accept",
  reopen: "Reopen as draft",
  accept: "Accept query",
  usedBy: "Used by {count} routes",
  saveBeforeUsages: "Save this query before changing its usages.",
  savingSnapshot: "Saving snapshot…",
  saved: "Saved",
  readOnly: "Read-only access. Queries can be inspected but not changed.",
  storageMissing: "Storage is not connected. Changes cannot be saved.",
  noQueries: "No queries for {model}",
  createIntro: "Create a query for a page or application usage.",
  createQuery: "Create query",
  renameQuery: "Rename query",
  deleteQuestion: "Delete query?",
  applicationUsages: "Application usages",
  duplicateQuery: "Duplicate query",
  name: "Name",
  usageKey: "Usage key",
  usagePattern:
    "Lowercase letters, digits and single hyphens, starting with a letter.",
  usageHint: "Stable identity for this application usage.",
  deleteNamed: "Delete “{name}”?",
  deleteDraft: "Its unsaved edits will also be removed.",
  unlinkBeforeDelete: "Unlink application usages before deleting this query.",
  sharedRoutes:
    "These registered routes will share this query. Other variants stay separate.",
  noRoutes: "No compatible, unassigned routes are available.",
  cancel: "Cancel",
  deleteQuery: "Delete query",
  saveUsages: "Save usages",
  copyName: "{name} copy",
  modelMissing: "The selected model is not in the supplied schema.",
  nameRequired: "Enter a query name.",
  usageConflict: "Another {operation} query already uses “{usage}”.",
  deleteDisconnected: "Deletion is not connected to storage.",
  linkDisconnected: "Usage linking is not connected.",
  saveBeforeLink: "Save this query before linking application usages.",
  routeGone: "A selected route is no longer available.",
  mappingUnconfirmed: "The requested usage mappings were not confirmed.",
  operationFailed: "The operation failed. Your edits are retained.",
  openQueries: "Open queries",
  queryName: "Query name",
  renameNamed: "Rename {name}",
  closeNamed: "Close {name}",
  queryView: "Query view",
  builder: "Builder",
  prismaQuery: "Prisma query",
  selectOperation: "Select a Prisma operation first.",
  queryPath: "Query path",
  previousItem: "Previous array item",
  nextItem: "Next array item",
  addItem: "Add array item",
  removeItem: "Remove array item",
  itemOf: "Item {index} of {count}",
  items: "Items ({count})",
  item: "Item {index}",
  fieldCount: "Fields: {count}",
  enumValues: "Enum values",
  fields: "Fields",
  noFields: "No fields available",
  emptyFields: "(no fields)",
  openNamed: "Open {name}",
  addNamed: "Add {name}",
  removeNamed: "Remove {name}",
  copying: "Copying",
  copied: "Copied",
  copyFailed: "Copy failed",
  copy: "Copy",
  format: "Format",
  run: "Run",
  standardClient: "Using standard Prisma Client",
  sqlClient: "Using prisma-sql",
  stateDraft: "Draft",
  stateAccepted: "Accepted",
  stateDisabled: "Disabled",
  stateInvalid: "Invalid",
  stateStale: "Needs review",
  errorInvalid: "Invalid query value ({code}).",
  errorSyntax:
    "Use a Prisma object literal with JSON values, not executable expressions.",
  errorDuplicateKey: "Duplicate query key: {key}",
  errorOperation:
    "Keep the selected Prisma model and operation; edit only its arguments.",
  errorSize: "The query exceeds its size or complexity limit.",
  errorObject: "Query arguments must be an object.",
  errorRequired: "A required value is missing.",
  errorString: "Enter a nonempty string of at most 512 characters.",
  errorIdentifier: "Use a valid Prisma identifier.",
  errorBoolean: "Use a boolean value.",
  errorInteger: "Use an integer in the permitted range.",
  errorUnsupported: "This argument or value is not supported.",
  errorArray: "Use an array of valid values.",
  errorJson: "Use plain, finite JSON data.",
  errorSchema: "The schema changed. Review this query again.",
  errorDepth: "The query exceeds the allowed nesting depth.",
  errorUnique: "Use a complete unique selector.",
  errorUniqueNull: "A unique selector cannot be null.",
  errorArrayShape: "All array items must have the same shape.",
  errorMode: "This filter cannot use this string mode.",
  errorOrder: "This field does not support this ordering.",
  errorProjection: "Select supported fields with true, or remove them.",
  errorInclude: "include accepts relations only.",
  errorNestedWrite: "Nested relation writes are not supported.",
  errorCardinality:
    "A to-one relation needs one unique selector, not an array.",
  errorReadonly: "This field is controlled by Prisma.",
  errorBytes: "Binary query templates are not supported.",
  errorProjectionConflict: "select and include cannot share the same level.",
  errorConstraint: "This constraint does not fit the query or field.",
  errorAccepted: "Only enabled, valid, accepted queries can be used.",
  errorSaveMismatch: "Storage did not confirm the exact saved query.",
  errorIdentity: "Duplicate the query to use a different identity.",
  errorReview: "Review and correct the query before accepting it.",
  cmCompletions: "Completions",
  cmSelectionDeleted: "Selection deleted",
  cmControlCharacter: "Control character",
  cmDiagnostics: "Diagnostics",
  cmNoDiagnostics: "No diagnostics",
  cmFind: "Find",
  cmReplace: "Replace",
  cmNext: "next",
  cmPrevious: "previous",
  cmAll: "all",
  cmMatchCase: "match case",
  cmRegexp: "regexp",
  cmByWord: "by word",
  cmReplaceLower: "replace",
  cmReplaceAll: "replace all",
  cmClose: "close",
  cmGoToLine: "Go to line",
  cmGo: "go",
  cmCurrentMatch: "current match",
  cmOnLine: "on line",
  cmReplacedLine: "replaced match on line $",
  cmReplacedMatches: "replaced $ matches",
  arguments: "Arguments",
  usedByOne: "Used by {count} route",
  resizePanels: "Resize query panels",
  builderPercent: "{percent} percent builder",
  errorIntegerRange: "Use an integer between {min} and {max}.",
} as const;
export type QueryCopyKey = keyof typeof QUERY_COPY;
export type QueryCopyValues = Readonly<Record<string, string | number>>;
export type QueryTranslator = (
  key: QueryCopyKey,
  values?: QueryCopyValues,
) => string;
export const englishQueryCopy: QueryTranslator = (key, values = {}) =>
  QUERY_COPY[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    String(values[name] ?? placeholder),
  );

const ISSUE_COPY: Readonly<Record<string, QueryCopyKey>> = {
  size: "errorSize",
  limit: "errorSize",
  object: "errorObject",
  prototype: "errorJson",
  cycle: "errorJson",
  json: "errorJson",
  unsafe_key: "errorIdentifier",
  unknown_key: "errorUnsupported",
  missing_key: "errorRequired",
  string: "errorString",
  identifier: "errorIdentifier",
  boolean: "errorBoolean",
  integer: "errorInteger",
  unsupported: "errorUnsupported",
  array: "errorArray",
  duplicate: "errorInvalid",
  usage_key: "usagePattern",
  name: "nameRequired",
  identity: "errorIdentity",
  array_index: "errorInteger",
  empty: "errorRequired",
  stale_schema: "errorSchema",
  stale_model: "errorSchema",
  stale_field: "errorSchema",
  relation_depth: "errorDepth",
  filter_depth: "errorDepth",
  bigint: "errorInteger",
  unique_selector: "errorUnique",
  unique_null: "errorUniqueNull",
  ambiguous_array: "errorArrayShape",
  negative_forced_mode: "errorMode",
  mode: "errorMode",
  unsupported_filter: "errorUnsupported",
  operator: "errorUnsupported",
  relation_order: "errorOrder",
  order_type: "errorOrder",
  unsupported_projection: "errorProjection",
  include: "errorInclude",
  projection: "errorProjection",
  implicit_projection: "errorProjection",
  nested_write_depth: "errorNestedWrite",
  relation_cardinality: "errorCardinality",
  readonly_field: "errorReadonly",
  bytes: "errorBytes",
  projection_conflict: "errorProjectionConflict",
  required: "errorRequired",
  required_field: "errorRequired",
  constraint_target: "errorConstraint",
  unresolved_source: "errorConstraint",
  source_failed: "errorConstraint",
  constraint_shape: "errorConstraint",
  constraint_type: "errorConstraint",
  shape: "errorInvalid",
  not_accepted: "errorAccepted",
  invalid_accepted: "errorAccepted",
  save_mismatch: "errorSaveMismatch",
  invalid_template: "errorReview",
  unknown_hook: "errorUnsupported",
  unknown_query: "errorUnsupported",
  unknown_operation: "errorUnsupported",
  unknown_mapping: "errorConstraint",
  inactive_mapping: "errorAccepted",
  mapping_mismatch: "errorConstraint",
  missing_route: "errorRequired",
  missing_usage: "errorRequired",
};
export function queryIssueText(
  issue: { path: string; code: string; message: string },
  translate: QueryTranslator,
): string {
  const at =
    issue.code === "stale_schema"
      ? ""
      : issue.path.replace(/^\$query\.?/, "").replace(/^payload\.?/, "");
  const bounds =
    issue.code === "integer"
      ? /^Expected an integer between (\S+) and (\S+)$/.exec(issue.message)
      : null;
  const key = bounds
    ? "errorIntegerRange"
    : issue.code === "syntax"
      ? "errorSyntax"
      : issue.code === "operation"
        ? issue.message === "Select a Prisma operation first"
          ? "selectOperation"
          : "errorOperation"
        : issue.code === "duplicate_key"
          ? "errorDuplicateKey"
          : (ISSUE_COPY[issue.code] ?? "errorInvalid");
  const text = translate(key, {
    code: issue.code,
    min: bounds?.[1] ?? "",
    max: bounds?.[2] ?? "",
    key:
      issue.code === "duplicate_key" &&
      issue.message.startsWith("Duplicate query key: ")
        ? issue.message.slice("Duplicate query key: ".length)
        : issue.path,
  });
  return at ? `${at}: ${text}` : text;
}
export function queryFailure(key: QueryCopyKey, values: QueryCopyValues = {}) {
  return Object.assign(new Error(englishQueryCopy(key, values)), {
    queryCopy: { key, values },
  });
}
const isCopyKey = (key: string): key is QueryCopyKey =>
  Object.hasOwn(QUERY_COPY, key);
export function queryErrorText(
  error: unknown,
  translate: QueryTranslator,
): string {
  if (error instanceof Error && "queryCopy" in error) {
    const copy = error.queryCopy;
    if (
      copy !== null &&
      typeof copy === "object" &&
      "key" in copy &&
      typeof copy.key === "string" &&
      isCopyKey(copy.key) &&
      "values" in copy &&
      copy.values !== null &&
      typeof copy.values === "object"
    ) {
      const values: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(copy.values))
        if (typeof value === "string" || typeof value === "number")
          values[key] = value;
      return translate(copy.key, values);
    }
  }
  if (
    error instanceof Error &&
    error.name === "GuardPolicyError" &&
    "issue" in error
  ) {
    const issue = error.issue;
    if (
      issue !== null &&
      typeof issue === "object" &&
      "path" in issue &&
      "code" in issue &&
      "message" in issue &&
      typeof issue.path === "string" &&
      typeof issue.code === "string" &&
      typeof issue.message === "string"
    )
      return queryIssueText(issue, translate);
  }
  return error instanceof Error ? error.message : translate("operationFailed");
}
export function queryStateText(
  state: string | undefined,
  translate: QueryTranslator,
): string {
  const keys: Readonly<Record<string, QueryCopyKey>> = {
    draft: "stateDraft",
    accepted: "stateAccepted",
    disabled: "stateDisabled",
    invalid: "stateInvalid",
    stale: "stateStale",
  };
  return translate(keys[state ?? "draft"] ?? "stateDraft");
}
export function queryEditorPhrases(
  translate: QueryTranslator,
): Record<string, string> {
  return {
    Find: translate("cmFind"),
    Replace: translate("cmReplace"),
    next: translate("cmNext"),
    previous: translate("cmPrevious"),
    all: translate("cmAll"),
    "match case": translate("cmMatchCase"),
    regexp: translate("cmRegexp"),
    "by word": translate("cmByWord"),
    replace: translate("cmReplaceLower"),
    "replace all": translate("cmReplaceAll"),
    close: translate("cmClose"),
    "Go to line": translate("cmGoToLine"),
    go: translate("cmGo"),
    "current match": translate("cmCurrentMatch"),
    "on line": translate("cmOnLine"),
    "replaced match on line $": translate("cmReplacedLine"),
    "replaced $ matches": translate("cmReplacedMatches"),
    Completions: translate("cmCompletions"),
    "Selection deleted": translate("cmSelectionDeleted"),
    "Control character": translate("cmControlCharacter"),
    Diagnostics: translate("cmDiagnostics"),
    "No diagnostics": translate("cmNoDiagnostics"),
  };
}
