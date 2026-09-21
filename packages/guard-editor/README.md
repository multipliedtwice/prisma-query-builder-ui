# Guard editor preparation package

A controlled Svelte 5 guard-policy editor and a framework-independent policy core. This is a private source package, not a published release. The preparation report records which verification gates actually ran; source availability is not visual or production approval.

The package lives at `packages/guard-editor` inside the `prisma-query-builder-ui` repository. It has **no production dependencies**. Svelte is an optional peer, needed only for the `/svelte` export. The standalone query playground and its Prisma 7 database adapters are not dependencies of this package.

## Public imports

Use the local package name `@prisma-query-builder/guard-editor` after building and linking this directory through the consumer's normal package manager. Importing the original `prisma-query-builder-ui` package is not required.

| Subpath | Public contract |
| --- | --- |
| `.` or `/core` | Core types, schema/capability readers, policy reader/validator/parser/serializer, compiler and pure editor-state helpers |
| `/types` | AST, descriptors, capabilities, operations, validation and resolver types |
| `/schema` | `readSchema`, model/field lookup, compatible operators and ordering support |
| `/dmmf` | `normalizeDmmf`, `DmmfDocumentLike` and structural DMMF adapter types |
| `/validation` | `readPolicy`, `validatePolicy`, `parsePolicy`, `serializePolicy`, literal validation |
| `/compiler` | `compilePolicy`, compiled shape/result types, `previewCompiledPolicy`, runtime force marker |
| `/svelte` | `GuardShapeBuilder`, `GuardShapeBuilderProps` |

`readPolicy` throws a structured refusal. `validatePolicy` returns `{ ok: true, value }` or `{ ok: false, issues }`. Every issue has a path, stable code and message. `parsePolicy` accepts JSON text and rejects duplicate object keys, including escaped duplicates. `serializePolicy` revalidates before canonical serialization. `canonicalJson` is a generic JSON utility, not a policy validator.

## Complete minimal core example

```ts
import { readSchema, readCapabilities, readPolicy, compilePolicy, serializePolicy } from '@prisma-query-builder/guard-editor/core';

export const schema = readSchema({
  version: 1,
  models: [{
    name: 'Article',
    fields: [
      { name: 'id', kind: 'scalar', type: 'Int', list: false, nullable: false, writable: true, hasDefault: true },
      { name: 'title', kind: 'scalar', type: 'String', list: false, nullable: false, writable: true, hasDefault: false },
    ],
    uniqueSelectors: [{ name: 'id', fields: ['id'] }],
  }],
});
export const capabilities = readCapabilities({
  version: 1,
  operations: ['findMany'],
  models: [{
    model: 'Article', select: ['id', 'title'],
    where: [{ field: 'id', operators: ['equals'] }, { field: 'title', operators: ['in'] }],
    unique: [], orderBy: ['id'], create: [], update: [], relations: [], forced: [],
  }],
  maxRelationDepth: 0,
  pagination: { max: 100, allowSkip: true },
  sources: [],
}, schema);
export const context = { schema, capabilities };
export const initialPolicy = readPolicy({
  version: 1, model: 'Article', operation: 'findMany', enabled: true,
  select: [{ kind: 'field', field: 'id' }, { kind: 'field', field: 'title' }],
  where: [{ kind: 'scalar', field: 'id', operators: ['equals'] }],
  unique: [], orderBy: ['id'], data: [], skip: true,
  take: { default: 25, max: 100 },
}, context);
export const policyJson = serializePolicy(initialPolicy, context);
export const compiled = compilePolicy(initialPolicy, context);
```

A consumer must treat `compiled.enabled === false` as a disabled operation. It must never turn that result into an absent or empty guard configuration on an enabled route. Enabled results contain `shape` and `requirements.enforceProjection: true`. Enforce that projection requirement in the consumer's prisma-guard configuration; merely passing `select` does not establish the mutation-return boundary.

## Controlled Svelte embedding

With the preceding values in the consumer's `policy-fixture.ts`:

```svelte
<script lang="ts">
  import { GuardShapeBuilder } from '@prisma-query-builder/guard-editor/svelte';
  import { schema, capabilities, initialPolicy } from './policy-fixture.js';
  let policy = $state(initialPolicy);
</script>

<GuardShapeBuilder
  {schema}
  model="Article"
  operation="findMany"
  {policy}
  {capabilities}
  readOnly={false}
  onChange={(next) => { policy = next; }}
/>
```

The consumer owns the value. The component does not mutate props, reset stale input, save anything, execute a query, resolve a named source or fetch a schema. Changing a valid control emits a complete newly validated value. The consumer may accept it by replacing the prop or retain the existing value. Numeric and JSON-literal controls may hold invalid draft text with an associated error, but no invalid policy is emitted. Matching model/operation changes remount only their transient editing controls; mismatched policy is refused.

Projection, unique selectors, filters/operators, writable fields, ordering, skip and bounds have labelled controls. Relation navigation is lazy, explicitly granted and bounded. Read-only mode disables mutation, not preview scrolling or relation navigation. The stylesheet reuses the standalone library's shadcn tokens without importing its application-level components or utility graph. It uses native inputs, fieldsets and buttons, scoped styles, visible focus and 44-pixel effective touch targets. The browser harness checks 390x844 and 1440x900; consult the report before treating those checks as executed.

## JSON AST and refusal rules

Version 1 is one model and one operation per policy. All top-level keys are mandatory: `version`, `model`, `operation`, `enabled`, `select`, `where`, `unique`, `orderBy`, `data`, `skip`, `take`. Nonapplicable collections must be empty, `skip` must be false and `take` must be null. The initial operations are `findMany`, `findManyPaginated`, `findUnique`, `create`, `update` and `delete`.

Selections are scalar/enum leaves or explicit nested relation selections. Filters are scalar operator allowlists, forced equality predicates or bounded relation branches. Unique operations use complete named constraints, not filter operators; an allowed compound selector compiles to every constituent field. Client unique selectors cannot overlap a forced predicate. Create/update data is a scalar/enum client grant or a forced value; relation writes are never supported.

An enabled policy must select return fields. List operations require positive default/max pagination. Unique operations require at least one granted unique selector. Create/update require at least one data rule. Disabled policies may be empty but are still checked for unknown keys, stale fields and invalid retained rules.

Capabilities separately grant operations, model exposure, projection, field/operator pairs, unique selectors, ordering, create/update data, forced targets and source identifiers. Relations require explicit grants plus a positive depth. Nothing is inferred from missing configuration. Limits are five relation levels, consumer-capped page sizes up to 10,000, JSON depth 64 and 20,000 JSON nodes. Input JSON text is limited to 262,144 UTF-16 code units; object input also bounds cumulative string/key size. Larger input refuses instead of being truncated.

Unsupported field kinds, reserved guard names (`AND`, `OR`, `NOT`, `_count`), unsafe object keys, duplicate entries, unknown versions/keys/operators, sparse arrays, functions, accessors, non-JSON prototypes and stale model/field/enum/constraint references refuse. Canonical output sorts object keys and permission collections by code-unit order. Literal arrays and compound selector field order retain their meaning. Unicode literal content is preserved; no locale-sensitive sorting is used.

## Forced values and compilation

Literal nodes are `{ kind: 'literal', value: <JSON data> }`. Named nodes are `{ kind: 'source', name: <consumer identifier> }`. Capabilities separately grant literal use and each named source for each field and target. Named sources have consumer-provided labels; the control shows those labels and provides no expression editor. The JSON preview necessarily includes the stored identifier.

Compiling an enabled named node requires a synchronous `SourceResolver`. It receives a frozen `{ source, model, field, target }` request and must return a JSON value compatible with that field. Missing resolvers, unknown sources, promises, invalid values and resolver failures refuse. Resolver errors do not expose the consumer exception text. Disabled results produce no shape and never call a resolver. JSON objects that happen to resemble source nodes remain ordinary data inside a literal.

The static compiler is data-only. It creates prisma-guard-compatible force wrappers using the supplied library's `Symbol.for('prisma-guard.forced')` marker, without importing its runtime. Parent contracts check that the actual supplied prisma-guard recognizes those wrappers. **Do not JSON-stringify and later reuse a compiled shape:** JSON loses runtime symbols. Store the validated policy AST, revalidate it against the current context and compile again at the trusted consumer boundary. The compiled preview uses `$force` as a labelled display convention, not as an executable policy format.

Supported forced literals include finite numbers, int32 integers, strings, booleans, declared enums, non-null JSON data and compatible arrays. BigInt is a signed 64-bit decimal string. Decimal accepts a JSON number or decimal string. DateTime is an exact UTC ISO timestamp with milliseconds. Nullable non-JSON scalar fields accept null. Bytes forced values and ambiguous top-level JSON null/database-null sentinels are outside this subset.

### Conservative boundaries inherited from the supplied guard

The supplied guard implicitly exposes `mode` for String `equals`, `contains`, `startsWith` and `endsWith`. This compiler forces `mode: 'default'` so these operators do not silently grant client-selectable case mode. Consumers must verify that their connector accepts that mode before exposing these operators. DMMF-version compatibility is not database-connector acceptance; the adapter intentionally does not infer a connector from absent metadata.

Negative relation operators (`none`, `isNot`) refuse any explicit forced descendant and any string operator that would introduce that forced mode. This prevents the supplied guard's mixed forced/client negative-branch refusal. Positive relation branches remain bounded and explicit.

Recursive `not`, logical combinators, full-text search, JSON path operators, arbitrary case modes, aggregation, relation ordering, relation-write payloads and raw expressions are outside version 1. `not: true` would expand nested permissions in the supplied guard, so it is not treated as a harmless scalar flag. For mutation relation projections, the caller may need to provide explicit bounded nested selections rather than rely on inferred defaults under `enforceProjection`; consumer runtime acceptance must exercise that contract.

## Prisma 6 / 7 adapter

`normalizeDmmf(document)` reads the data-only `datamodel` subtree, not query mappings, query execution or generated clients. The structural input type accepts the relevant readonly shapes in Prisma 6.19.3 and 7.3.0. Irrelevant DMMF metadata is intentionally not part of the normalized descriptor; new relevant field kinds/types fail closed.

The descriptor preserves enum values, nullability, list/relation cardinality, defaults, compound constraint order and names. Generated and updated-at scalars are not writable. DMMF `isReadOnly` on a foreign-key scalar is not an authorization rule: explicit scalar-write capabilities may expose that scalar without enabling nested writes. The adapter does not automatically grant any capability.

The authored version fixtures and their provenance are documented in `test/fixtures/README.md`. Actual engine-backed contracts live in a separately installed `test/prisma-contract` package; they do not add either Prisma engine to this package or to Dee Wan's workspace.

## Focused verification commands

Use the parent's declared Node 24/npm 11 toolchain where available. Inspect CPU, memory, disk and competing runs before each check. From this package directory, with dependencies already installed:

```sh
npm run build:core
npm run check
npm test
npm run build
npm run check:exports
npm run test:browser
npm run test:prisma
```

`test:prisma` additionally needs the isolated contract package's declared dependencies. No database, generated client or external service is used by those contracts. Do not run the parent verified installer for a source-only snapshot with no lockfiles. A temporary dependency installation, when authorized, must use `--ignore-scripts --package-lock=false` and must not enter the returned source archive.

For headless-only export validation, `node scripts/check-exports.mjs --core-only` explicitly excludes the Svelte build gate. It is not a full-package pass. From Dee Wan's root, `npm run guard-editor:check` checks the component and the isolated parent TypeScript consumer; `npm run guard-editor:test` runs the parent marker, operation-key and import-boundary contracts after the core build.

The transitive source-graph check follows every public export, relative imports, re-exports, type imports, Svelte scripts and CSS. Only Svelte itself is an allowed external public import. Server/execution/workspace/database paths, Prisma/Node imports, dynamic module loading, environment access and persistence/network APIs refuse. The scanner's own adversarial fixtures exercise those refusals.

The Playwright harness mounts this component only, not Dee Wan. It checks callbacks, held props, read-only state, refusal, sources/literals, keyboard focus, error association, touch targets, overflow and absence of network/storage effects. It writes disposable screenshots for inspection. Dee Wan Cypress and Chrome acceptance apply only after a later authorized integration task.
