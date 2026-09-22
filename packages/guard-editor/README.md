# Saved Prisma query templates

This private source package adapts the original `prisma-query-builder-ui` editor for controlled embedding. Administrators author concrete Prisma query templates. A guard shape is derived internally; it is not another authoring format.

The product hierarchy is **model → operation → named usage/variant → query template**. Several queries can use the same model and operation without combining permissions. Several trusted routes may explicitly reference one query.

## One editor implementation

`src/components/ArgTree.svelte`, `CodePreview.svelte`, and `QueryTabBar.svelte` in the original library are the shared implementation. Both the original `QueryTabs.svelte` playground and the new `SavedQueryWorkspace.svelte` compose `QueryEditor.svelte`, which uses those components directly. This is not a copy of their markup or a new policy form. The original CodeMirror preview remains an editable Prisma query representation; its execution control is present only when the standalone owner supplies an execution callback.

`QuerySchema` extracts the browser-safe structural portion of the original parser contract. `createQuerySchema` adapts a normalized descriptor to that contract. The standalone DMMF parser still supplies the same interface for its existing operations. Shared immutable payload/path helpers keep navigation and query edits consistent, including chained enum and array interactions.

The controlled graph has no Prisma runtime, query execution, workspace database, original queries client, server routes, filesystem, environment, fetch, or storage dependency. UI peers are the original Svelte, shadcn/Bits UI, CodeMirror, and formatting dependencies. They are optional for headless consumers; no Prisma 7 adapter enters Dee Wan through this package.

## Public entry points

| Entry | Purpose |
| --- | --- |
| `/templates` | Saved-query readers, schema identity, inspection, deterministic derivation, trusted usage manifests, snapshot save helpers, schema adapter and public types. |
| `/query` | Original structural query types, immutable payload/path utilities, safe literal parser, normalized query-schema adapter. |
| `/svelte` | `SavedQueryWorkspace`, `ControlledQueryBuilder` (the shared original composition), and `SavedQueryWorkspaceProps`. |
| `/schema`, `/dmmf` | Normalized descriptors and structural DMMF adapter. |
| Root, `/core`, `/types`, `/validation`, `/compiler` | Retained headless validation/compiler compatibility exports. The old policy authoring components are removed. |

The package is private and has no invented release version. The stage-based build includes shared source from its single canonical location and rewrites relative imports for emitted artifacts. It does not maintain a second editor source tree. The original standalone package uses the same staging helper and still requires its existing generated query-history client. The controlled package does not require that client.

## Saved query and owner contract

`SavedQueryTemplate` has `version: 1`, `id`, `name`, `model`, `operation`, `usageKey`, `payload`, `enabled`, `accepted`, and `schema: { id, revision }`. IDs and `(model, operation, usageKey)` must be unique. Changing stable identity requires duplication, not renaming. `name` is the editable display name.

`payload` is a concrete, JSON-serializable Prisma argument object. The code editor accepts object literals with unquoted keys, quoted strings, arrays, finite scalars, and trailing commas. It does not evaluate JavaScript. Functions, expressions, getters, duplicate keys, prototype keys, raw SQL, and changing the selected model/operation in code are refused.

The component receives `context`, `model`, current `queries`, persisted `savedQueries`, explicit `bindings`, the server-registered `trustedRoutes` catalogue, `createId`, and `onchange`. The owner must supply the actual schema identity; a caller-supplied revision is not independently verified against a database by this package.

`onchange` receives proposed complete saved-query values. Incomplete concrete drafts may be retained, but they cannot be accepted or generate a guard. Payload edits clear acceptance. Navigation does not. An owner can refuse an update by retaining its current props.

Optional owner callbacks:

- `onSave(query): Promise<SavedQueryTemplate>` stores and acknowledges the exact detached snapshot. Update `savedQueries` after durable success and before resolving. An acknowledgment with changed metadata, identity, or payload is refused. Current edits are never replaced by an old completion.
- `onDelete(savedQuery): Promise<void>` performs deletion after confirmation. Linked queries must first be explicitly unlinked. Reject on storage conflicts; do not silently delete a newer record.
- `onLink(query, routeIds): Promise<UsageBinding[]>` persists explicit reuse against the trusted route catalogue and returns the validated complete binding list. The component does not create routes or infer their authority.

Without a save callback, the workspace says storage is not connected. Dirty, saving, saved, failure, accepted, disabled, invalid, and stale states are distinct. Unsaved edits and invalid code remain associated with their own query when switching. Save all submits each dirty query separately. Deletion requires confirmation. Read-only permits navigation but disables changes.

An enabled/accepted query with an old schema revision remains stale. Explicit review validates the payload against the new schema and is required before reacceptance; unknown fields are not removed automatically. Generation also validates the manifest revision, mappings, and referenced queries.

## Conservative derivation

The current accepted operations are actual Prisma `findMany`, `findFirst`, `findUnique`, `create`, `update`, and `delete`. The synthetic `findManyPaginated` operation is not a saved Prisma template operation.

`deriveGuard(query, context, constraints?, resolver?)` validates before compiling and never mutates its inputs. The output identifies the query and usage and requires `enforceProjection: true` and trusted variant selection.

| Template content | Derived artifact |
| --- | --- |
| `select` / `include` | Accepted structural projection, with bounded relation arguments. Omitted projection is resolved to the reviewed model's scalar fields. Relation `true` resolves to that relation's scalar projection. |
| `where` | Only represented fields/operators. Ordinary example values become allowed typed leaves, not forced values. Complete unique selectors remain complete. |
| `orderBy` | Only represented ordering fields and bounded to-one relation structure. |
| `skip` | Allowed only when present. |
| Positive `take` | The saved value is both initial default and maximum, bounded by the supplied maximum. |
| Mutation `data` | Only represented writable fields and supported nested operations. Required create values must be supplied or explicitly server-constrained. |

The supported nested mutation subset is one-level `connect` with complete unique selectors. To-one relations accept one selector, not an array. Nested create/update/delete/upsert, relation counts, cursor, distinct, aggregation/grouping, arbitrary JSON/Bytes filters, and incompatible/null operator values are refused. Homogeneous array shapes can be retained; heterogeneous shapes are refused rather than unioned. This is a conservative subset, not a claim to support every Prisma operation or connector.

The supplied guard runtime adds String `mode` for some operators. When the query does not explicitly represent mode, derivation restricts this runtime-created option to `force('default')`; this constant is not inferred from an example scalar or identity field. Explicit represented mode remains an allowed enum leaf. Negative branches that cannot preserve this restriction in the supplied runtime are refused. String-filter behavior still needs connector-backed acceptance.

## Trusted constraints, hooks and routes

Ordinary literals such as a sample tenant identifier, `active: false`, or a user ID never establish server authority. `TrustedConstraint` is a separate server-owned input: a `where` or `data` field with either an explicit literal or a named source. Sources require an explicit typed resolver, whose returned value is validated. Missing or failed resolution refuses generation and does not expose the resolver's exception text.

Resolvers belong to the trusted server boundary, never the editor or client request. Contextual user/tenant values must be resolved for the current server request; do not reuse a resolved artifact across users or persist actor values as a general build artifact. Dynamic server integration is deliberately not invented here.

`UsageManifest` stores the schema identity and explicit route-to-query bindings, including model, operation, and usage key. `generateUsageManifest` also requires the trusted route catalogue, named hook registry, per-operation hooks, and per-query trusted extensions. It refuses duplicate, missing, unknown, mismatched, disabled, unaccepted, or stale mappings. Every active accepted query must have an explicit route mapping.

Each usage derives its own shape. No model-wide or operation-wide union is constructed. Operation and variant hooks remain named references outside the query; before hooks run in operation/variant order and after hooks in variant/operation order when a future trusted runtime invokes them. This package does not execute hooks. The output declares `variantSelection: 'trusted-server-route-only'`; route identities are server configuration, not client headers or body fields.

The example fixtures reproduce the recorded multi-usage pattern, not the unavailable external TalentProfile application's exact data or routes.

## Dee Wan shell and preview

`ModelQueryWorkspace.svelte` is the selected-model page-content host. The frontend shell preview renders it inside Dee Wan's existing `WorkspaceLayout`, actual Sidebar, theme, site switcher, breadcrumbs, and identity area. The real authenticated application layout already uses that same frame; no replacement shell was introduced.

The preview has a visible browser-storage disclosure, realistic named templates, and actual save/reload/rename/duplicate/delete/reuse flows. Its owner persists templates and manifest to localStorage, refuses malformed records and detectable cross-tab conflicts, and does not pretend to be a production CMS API. Test-only failure injection is in browser assertions; no validation toggle or fixture-control button appears in the workspace.

Production model-builder persistence, authoritative generated schema lookup/revision, route registration, runtime hook execution and generated-backend activation are not wired by this package. Those require their canonical owner contracts; the focused parent spike records proposed specification changes.

## Verification commands

From this directory, use the declared toolchain and installed dependencies:

```sh
npm run build:core
npm run check
npm test
npm run build
npm run check:exports
npm run test:browser
npm run test:shell
npm run test:prisma
```

Parent checks remain `npm run guard-editor:check` and `npm run guard-editor:test`. Frontend acceptance requires `npm --prefix frontend run check` and `npm --prefix frontend run build`. The focused browser configurations use 390×844 and 1440×900 and the actual component and application layout. No full Cypress run is required.

A syntax-only compiler pass does not establish Svelte type checking, package emission, rendered behavior, or layout approval. `FINAL-REPORT.md` records what ran and what was blocked in the implementation environment.
