# DMMF contract fixtures

`dmmf-6.19.3.json` and `dmmf-7.3.0.json` are deliberately small, authored structural fixtures, not captured engine output. Their consumed properties match the corresponding Prisma DMMF declarations:

- https://github.com/prisma/prisma/blob/6.19.3/packages/dmmf/src/dmmf.ts
- https://github.com/prisma/prisma/blob/7.3.0/packages/dmmf/src/dmmf.ts

They cover enums, nullable scalars, lists, defaults, updated-at fields, foreign-key scalar metadata, relations, individual IDs/unique fields, compound primary keys, and named compound unique indexes. Repeated representation of a constraint in `uniqueIndexes` and `uniqueFields` is intentional Prisma metadata; duplicate entries inside either list are refused.

`context.mjs` is an authored normalized descriptor/capability fixture. Its broad grants exercise the library; it is not a safe default capability preset for a product.

The separately installed `../prisma-contract` package exercises actual Prisma 6.19.3 and 7.3.0 `getDMMF` implementations without generating clients or connecting to a database. Its engines do not enter the editor package or Dee Wan's dependency graph. Run it separately; fixture passes do not mean engine-backed checks ran.
