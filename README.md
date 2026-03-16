# prisma-query-builder-ui

Visual query builder for Prisma Client - Developer tool for building and testing Prisma queries.


[![npm version](https://badge.fury.io/js/prisma-query-builder-ui.svg)](https://www.npmjs.com/package/prisma-query-builder-ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<img width="1512" height="864" alt="image" src="https://github.com/user-attachments/assets/ff601b79-9114-4280-ba86-1d5722b2fcd8" />

## Features

- 🎨 **Visual query builder** - Interactive interface for all Prisma operations (findMany, create, update, etc.)
- 🔗 **Nested relations** - Navigate and query related models seamlessly
- 💻 **Live code generation** - Real-time TypeScript code with auto-formatting
- ▶️ **Query execution** - Run queries and view results in table or JSON format
- 📦 **Multiple workspaces** - Upload and switch between different Prisma schemas (standalone mode)
- 💾 **Save queries** - Persist and manage queries per workspace (standalone mode)
- 🗂️ **Schema upload** - Drag & drop `.prisma` files with optional database URLs
- 📑 **Multi-tab editing** - Work on multiple queries simultaneously
- 🔍 **Query validation** - Validate queries before execution
- 🌓 **Theme support** - Dark and light modes
- 🔌 **Embedded mode** - Integrate with your API server and documentation
- ⚡ **prisma-sql support** - Optional 2-7x query performance boost (both modes)

## Installation

```bash
npm install -D prisma-query-builder-ui
# or
pnpm add -D prisma-query-builder-ui
# or
yarn add -D prisma-query-builder-ui
```

## Usage

### Mode 1: Standalone Application

Run the query builder as a standalone development server:

```bash
# Using npx
npx prisma-query-builder

# Or add to package.json scripts
{
  "scripts": {
    "query-builder": "prisma-query-builder"
  }
}

# Then run
npm run query-builder
```

Open http://localhost:5173 and:
1. **Upload a schema**: Click the workspace dropdown → Upload schema
2. **Add database URL** (optional): Required only for query execution
3. **Build queries**: Select operations from the sidebar
4. **Execute queries**: Click the play button
5. **Save queries**: Click "Save All" to persist queries per workspace

**Environment variables** (optional):

```bash
# Schema location
PRISMA_QUERY_BUILDER_SCHEMA=/path/to/schema.prisma  # Path to your schema file
PRISMA_QUERY_BUILDER_CWD=/path/to/project           # Working directory

# Server configuration
PORT=5173                                            # Server port (default: 5173)
HOST=localhost                                       # Server host (default: localhost)

# Database connection (optional, for query execution without workspace)
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Debug logging (optional)
PRISMA_QUERY_BUILDER_DEBUG=true                      # Enable verbose debug logs
```

### Mode 2: Embedded Mode (Integrated with API Server)

The query builder can run automatically alongside any API server and be embedded in documentation or development UIs.

**How it works:**

1. Your application spawns the query builder as a subprocess
2. Schema and database URL are provided via environment variables
3. Query builder runs on a separate port (default: 5173)
4. Your app embeds it via iframe or provides a link

**Basic Setup:**

```typescript
// start-query-builder.ts
import { spawn, ChildProcess } from 'child_process'
import { readFileSync } from 'fs'

let queryBuilderProcess: ChildProcess | null = null

export function startQueryBuilder(config?: {
  port?: number
  schemaPath?: string
  databaseUrl?: string
}) {
  // Skip in production
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  Query builder disabled in production')
    return
  }
  
  const port = config?.port || 5173
  const schemaPath = config?.schemaPath || './prisma/schema.prisma'
  const databaseUrl = config?.databaseUrl || process.env.DATABASE_URL
  
  // Read schema content
  const schemaContent = readFileSync(schemaPath, 'utf-8')
  
  console.log('🚀 Starting query builder on port', port)
  
  queryBuilderProcess = spawn('npx', ['prisma-query-builder'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      PRISMA_QUERY_BUILDER_MODE: 'embedded',
      DISABLE_PERSISTENCE: 'true',
      PRISMA_QUERY_BUILDER_SCHEMA_CONTENT: schemaContent,
      DATABASE_URL: databaseUrl || ''
    }
  })
  
  queryBuilderProcess.on('error', (err) => {
    console.error('❌ Query builder failed to start:', err.message)
  })
  
  // Cleanup on exit
  process.on('exit', stopQueryBuilder)
  process.on('SIGINT', () => {
    stopQueryBuilder()
    process.exit()
  })
  process.on('SIGTERM', stopQueryBuilder)
}

export function stopQueryBuilder() {
  if (queryBuilderProcess && !queryBuilderProcess.killed) {
    console.log('🛑 Stopping query builder...')
    queryBuilderProcess.kill()
    queryBuilderProcess = null
  }
}
```

**Using in your server:**

```typescript
// server.ts
import { startQueryBuilder } from './start-query-builder'

// Start your API server
const server = startYourApiServer()

// Start query builder in development
startQueryBuilder({
  port: 5173,
  schemaPath: './prisma/schema.prisma',
  databaseUrl: process.env.DATABASE_URL
})

console.log('🚀 API Server: http://localhost:3000')
console.log('📚 API Docs: http://localhost:3000/docs')
console.log('🔧 Query Builder: http://localhost:5173')
```

**Embedding in HTML (e.g., API docs):**

```html
<!DOCTYPE html>
<html>
<head>
  <title>API Documentation</title>
  <style>
    body { margin: 0; display: flex; height: 100vh; }
    .docs { width: 50%; overflow: auto; }
    .builder { width: 50%; border-left: 1px solid #ddd; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <div class="docs">
    <h1>API Documentation</h1>
    <!-- Your API documentation here -->
  </div>
  
  <div class="builder">
    <iframe src="http://localhost:5173?embedded=true&hideHeader=true"></iframe>
  </div>
</body>
</html>
```

**Query Parameters:**
- `embedded=true` - Enables embedded mode (hides workspace management)
- `hideHeader=true` - Hides the header bar
- `hideWorkspaceManager=true` - Alternative to `embedded=true`

**Environment Variables (Embedded Mode):**

```bash
# Mode flags
PRISMA_QUERY_BUILDER_MODE=embedded          # Enables embedded mode
DISABLE_PERSISTENCE=true                     # Disables query persistence

# Schema (provide one of these)
PRISMA_QUERY_BUILDER_SCHEMA_CONTENT="..."   # Schema as string (recommended)
PRISMA_QUERY_BUILDER_SCHEMA=/path/to/schema # Schema file path

# Database connection (optional)
DATABASE_URL=postgresql://...                # For query execution

# Server configuration
PORT=5173                                    # Query builder port
```

**Framework-Specific Examples:**

<details>
<summary><b>Express.js</b></summary>

```typescript
import express from 'express'
import { startQueryBuilder, stopQueryBuilder } from './start-query-builder'

const app = express()

// Your API routes
app.get('/api/users', (req, res) => {
  // ...
})

// Serve documentation with embedded query builder
app.get('/docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>API Docs</title></head>
    <body style="margin: 0; height: 100vh;">
      <iframe 
        src="http://localhost:5173?embedded=true&hideHeader=true" 
        style="width: 100%; height: 100%; border: none;">
      </iframe>
    </body>
    </html>
  `)
})

// Start servers
const server = app.listen(3000, () => {
  console.log('🚀 Server: http://localhost:3000')
  console.log('📚 Docs: http://localhost:3000/docs')
})

// Start query builder in development
if (process.env.NODE_ENV !== 'production') {
  startQueryBuilder({
    schemaPath: './prisma/schema.prisma',
    databaseUrl: process.env.DATABASE_URL
  })
}

// Cleanup
process.on('SIGTERM', () => {
  stopQueryBuilder()
  server.close()
})
```

</details>

<details>
<summary><b>Fastify</b></summary>

```typescript
import Fastify from 'fastify'
import { startQueryBuilder, stopQueryBuilder } from './start-query-builder'

const fastify = Fastify({ logger: true })

// Your API routes
fastify.get('/api/users', async (request, reply) => {
  // ...
})

// Documentation route
fastify.get('/docs', async (request, reply) => {
  reply.type('text/html')
  return `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; height: 100vh;">
      <iframe 
        src="http://localhost:5173?embedded=true" 
        style="width: 100%; height: 100%; border: none;">
      </iframe>
    </body>
    </html>
  `
})

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3000 })
    
    // Start query builder in development
    if (process.env.NODE_ENV !== 'production') {
      startQueryBuilder()
    }
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()

// Cleanup
process.on('SIGTERM', () => {
  stopQueryBuilder()
  fastify.close()
})
```

</details>

<details>
<summary><b>Hono</b></summary>

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { startQueryBuilder, stopQueryBuilder } from './start-query-builder'

const app = new Hono()

// Your API routes
app.get('/api/users', (c) => {
  // ...
})

// Documentation route
app.get('/docs', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; height: 100vh;">
      <iframe 
        src="http://localhost:5173?embedded=true&hideHeader=true" 
        style="width: 100%; height: 100%; border: none;">
      </iframe>
    </body>
    </html>
  `)
})

// Start server
const server = serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`🚀 Server: http://localhost:${info.port}`)
  console.log(`📚 Docs: http://localhost:${info.port}/docs`)
})

// Start query builder in development
if (process.env.NODE_ENV !== 'production') {
  startQueryBuilder()
}

// Cleanup
process.on('SIGTERM', () => {
  stopQueryBuilder()
  server.close()
})
```

</details>

<details>
<summary><b>Next.js</b></summary>

```typescript
// lib/query-builder.ts
import { spawn, ChildProcess } from 'child_process'
import { readFileSync } from 'fs'

let queryBuilderProcess: ChildProcess | null = null

export function startQueryBuilder() {
  if (process.env.NODE_ENV === 'production') return
  if (queryBuilderProcess) return // Already running
  
  const schemaContent = readFileSync('./prisma/schema.prisma', 'utf-8')
  
  queryBuilderProcess = spawn('npx', ['prisma-query-builder'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PRISMA_QUERY_BUILDER_MODE: 'embedded',
      PRISMA_QUERY_BUILDER_SCHEMA_CONTENT: schemaContent,
      DISABLE_PERSISTENCE: 'true'
    }
  })
}

// instrumentation.ts (Next.js server instrumentation file)
// This runs server-side only during startup
import { startQueryBuilder } from './lib/query-builder'

export function register() {
  if (process.env.NODE_ENV === 'development') {
    startQueryBuilder()
  }
}

// pages/docs.tsx (or app/docs/page.tsx)
export default function DocsPage() {
  return (
    <div style={{ height: '100vh', margin: 0 }}>
      <iframe 
        src="http://localhost:5173?embedded=true" 
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}
```

</details>

**Benefits of Embedded Mode:**
- ✅ No manual schema upload needed
- ✅ Automatically uses your project's database connection
- ✅ Integrated with your development workflow
- ✅ Single command to start everything
- ✅ Queries don't persist (always uses latest schema)
- ✅ Clean shutdown when parent process exits
- ✅ Framework agnostic

### Mode 3: Embedded in Your SvelteKit Application

Use the Svelte component directly in your SvelteKit app:

```svelte
<script lang="ts">
  import QueryBuilder from 'prisma-query-builder-ui/QueryBuilder.svelte';
  import { onMount } from 'svelte';
  
  let dmmf = $state();
  
  onMount(async () => {
    const response = await fetch('/api/dmmf');
    dmmf = await response.json();
  });
</script>

{#if dmmf}
  <QueryBuilder {dmmf} />
{/if}
```

**Required API endpoints:**

```typescript
// src/routes/api/dmmf/+server.ts
import { json } from '@sveltejs/kit';
import { getDMMF } from '@prisma/internals';
import { readFileSync } from 'fs';

export async function GET() {
  const schema = readFileSync('./prisma/schema.prisma', 'utf-8');
  const dmmf = await getDMMF({ datamodel: schema });
  return json(dmmf);
}
```

```typescript
// src/routes/api/execute/+server.ts
import { json } from '@sveltejs/kit';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST({ request }) {
  const { model, method, payload } = await request.json();
  
  const modelDelegate = prisma[model.toLowerCase()];
  const result = await modelDelegate[method](payload);
  
  return json({ success: true, data: result });
}
```

> **Note**: When embedded in SvelteKit, workspace upload and save queries features require additional API endpoints. See the standalone app source code for full implementation.

## Workspace Management (Standalone Mode Only)

The standalone application supports multiple workspaces, each with its own schema and database connection:

### Features

- **Create workspace**: Upload a `.prisma` schema file through the UI
- **Switch workspaces**: Use the dropdown in the sidebar
- **Database URLs**: Optional, but required to execute queries
- **Edit workspace**: Update database URLs without re-uploading schema
- **Delete workspace**: Remove workspace and all associated saved queries

### Workspace Contents

Each workspace maintains its own:
- Prisma schema and DMMF
- Database connection (optional)
- Saved queries
- Generated Prisma Client (in `.workspaces/{id}/` directory)

### Supported Databases

- **PostgreSQL** (via `@prisma/adapter-pg`)
- **MySQL/MariaDB** (via `@prisma/adapter-mariadb`)
- **SQLite** (via `@prisma/adapter-better-sqlite3`)

### Database URL Examples

```bash
# PostgreSQL
postgresql://user:password@localhost:5432/mydb

# MySQL
mysql://user:password@localhost:3306/mydb

# SQLite (relative path)
file:./dev.db

# SQLite (absolute path)
file:/absolute/path/to/database.db
```

### Workspace Storage

Workspaces are stored in:
- **Schema and metadata**: `queries.db` (SQLite database)
- **Generated clients**: `.workspaces/{workspace-id}/` directories
- **Location**: Root directory of the query builder

## Save Queries Feature (Standalone Mode Only)

In standalone mode, queries can be saved per workspace:

- **Dirty tracking**: Queries are marked as dirty (•) when modified
- **Save All**: Click the "Save All" button to persist all modified queries
- **Query naming**: Rename queries by clicking the edit icon on tabs
- **Persistence**: Saved queries reload when switching workspaces
- **Multi-tab**: Work on multiple queries simultaneously (max 20 tabs)

Queries are stored in a local SQLite database (`queries.db`) and survive application restarts.

## Query Execution with prisma-sql

Both standalone mode (with workspaces) and embedded mode support `prisma-sql` for 2-7x performance improvement:

**Standalone Mode (with workspaces):**
1. Toggle the "prisma-sql" switch in the code preview panel
2. Available when workspace has a database URL configured
3. Only works with PostgreSQL and SQLite

**Embedded Mode:**
1. Toggle the "prisma-sql" switch in the code preview panel
2. Available when `DATABASE_URL` environment variable is provided
3. Only works with PostgreSQL and SQLite
4. Uses generated client in `.prisma-query-builder-temp/`

The toggle automatically appears when all requirements are met. If unavailable, queries use standard Prisma Client.

## Development

```bash
# Install dependencies
npm install

# Generate Prisma Client for internal queries database
npm run prisma:generate:q

# Run migrations for queries database
npm run prisma:migrate:q

# Run development server
npm run dev

# Build for production
npm run build

# Create package for publishing
npm run package

# Type check
npm run check
```

## Requirements

- **Node.js** >= 18
- **Prisma** >= 7.0.0
- **Svelte** 5 (when using the component)

## How It Works

1. **Schema parsing**: Parses Prisma DMMF (Data Model Meta Format)
2. **Operation generation**: Generates all available operations from your schema
3. **Visual building**: Build type-safe queries through nested navigation
4. **Validation**: Validates queries against DMMF before execution
5. **Code generation**: Generates executable TypeScript code with formatting
6. **Execution**: Executes queries against your database (optional)
7. **Results**: Displays results in virtualized table or JSON format
8. **Persistence**: Saves queries per workspace (standalone mode only)

## Architecture

- **Frontend**: Svelte 5 with SvelteKit
- **Styling**: TailwindCSS 4
- **Code Editor**: CodeMirror 6 (read-only preview with copy and format)
- **Database**: SQLite (for storing workspaces and queries in standalone mode)
- **Prisma Client**: Generated per workspace in isolated directories (standalone) or in `.prisma-query-builder-temp/` (embedded)
- **Query Optimization**: Optional prisma-sql integration for faster queries (both modes)

## Use Cases

- **Development**: Test Prisma queries during development
- **Debugging**: Debug complex nested queries visually
- **Learning**: Learn Prisma query syntax interactively
- **Prototyping**: Rapidly prototype database queries
- **Documentation**: Generate and share query examples
- **Testing**: Test queries against multiple schemas/databases
- **API Development**: Build queries while developing your API (embedded mode)
- **Team Collaboration**: Share query builder with team via embedded mode

## Mode Comparison

| Feature | Standalone | Embedded | SvelteKit Component |
|---------|-----------|----------|---------------------|
| **Schema Upload** | ✅ Drag & drop | ❌ Auto-loaded via env | ❌ Passed as prop |
| **Multiple Workspaces** | ✅ Yes | ❌ Single schema | ❌ Single schema |
| **Query Persistence** | ✅ SQLite database | ❌ No | ⚠️ Requires custom implementation |
| **Database URL Required** | ⚠️ Optional | ⚠️ Optional | ⚠️ Optional |
| **Manual Start** | ✅ `npx prisma-query-builder` | ❌ Auto-start via spawn | ❌ Part of app |
| **Integrated with Docs** | ❌ No | ✅ Yes (iframe) | ✅ Yes (component) |
| **prisma-sql Support** | ✅ Yes (in workspaces) | ✅ Yes (when DATABASE_URL provided) | ⚠️ Depends on implementation |
| **Client Generation** | `.workspaces/{id}/` | `.prisma-query-builder-temp/` | Depends on implementation |
| **Port** | 5173 (configurable) | 5173 (configurable) | Same as SvelteKit app |
| **Process** | Standalone | Subprocess | Same process |
| **Use Case** | Development tool | API documentation | Full integration |
| **Production** | ⚠️ Dev only | ⚠️ Dev only | ⚠️ Dev only |

## Environment Variables Reference

### Standalone Mode

```bash
# Schema location (optional)
PRISMA_QUERY_BUILDER_SCHEMA=/path/to/schema.prisma
PRISMA_QUERY_BUILDER_CWD=/path/to/project

# Server configuration
PORT=5173
HOST=localhost

# Database connection (optional, for non-workspace execution)
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Cache control (optional)
MAX_CACHED_CLIENTS=50              # Max workspace clients to cache
CLIENT_IDLE_TIMEOUT=300000         # Idle timeout in ms (default: 5 minutes)

# Query execution (optional)
QUERY_TIMEOUT=30000                # Query timeout in ms (default: 30 seconds)

# Debug logging (optional)
PRISMA_QUERY_BUILDER_DEBUG=true    # Enable verbose debug logs
```

### Embedded Mode

```bash
# Mode flags (set by parent process)
PRISMA_QUERY_BUILDER_MODE=embedded
DISABLE_PERSISTENCE=true

# Schema (provide at least one)
PRISMA_QUERY_BUILDER_SCHEMA_CONTENT="datasource db { ... }"  # Preferred
PRISMA_QUERY_BUILDER_SCHEMA=/path/to/schema.prisma           # Alternative

# Database connection (optional)
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Server configuration
PORT=5173
HOST=localhost
```

### URL Query Parameters

When accessing the query builder via browser:

```
http://localhost:5173?embedded=true&hideHeader=true&hideWorkspaceManager=true
```

- `embedded=true` - Enables embedded mode features
- `hideHeader=true` - Hides the top header bar
- `hideWorkspaceManager=true` - Hides workspace management UI

## Troubleshooting

### Query builder won't start

```bash
# Check if port 5173 is already in use
lsof -i :5173

# Try a different port
PORT=5174 npx prisma-query-builder
```

### Schema not loading in embedded mode

Make sure you're setting the environment variable correctly:

```typescript
// ❌ Wrong
env: {
  PRISMA_QUERY_BUILDER_SCHEMA: './prisma/schema.prisma'
}

// ✅ Correct - pass schema content as string
env: {
  PRISMA_QUERY_BUILDER_SCHEMA_CONTENT: readFileSync('./prisma/schema.prisma', 'utf-8')
}
```

### Query execution fails

1. **Check database URL**: Make sure `DATABASE_URL` is set correctly
2. **In workspace mode**: Ensure the workspace has a database URL configured
3. **In embedded mode**: The parent app must provide `DATABASE_URL` env variable
4. **Check Prisma Client**: Run `npx prisma generate` in your project

### Workspaces not persisting

1. Check if `queries.db` exists in the query builder root directory
2. Run migrations: `npm run prisma:migrate:q`
3. Generate client: `npm run prisma:generate:q`

### prisma-sql not working

prisma-sql is available in both modes but requires:
- **Database URL**: Must be configured (workspace or env variable)
- **Supported databases**: PostgreSQL or SQLite only
- **Generated client**: Prisma Client must be generated
- **Toggle enabled**: Turn on the "prisma-sql" switch in the UI

If any requirement is missing, queries automatically fall back to standard Prisma Client.

### Debug logging

Enable verbose debug logs to troubleshoot issues:

```bash
PRISMA_QUERY_BUILDER_DEBUG=true npx prisma-query-builder
```

This will output detailed information about schema loading, client creation, query execution, and workspace management.

## Contributing

Contributions welcome! Please open an issue or PR.

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up queries database: `npm run prisma:migrate:q`
4. Start dev server: `npm run dev`

## Roadmap

- [ ] Query history (in-memory for embedded mode)
- [ ] Export queries to files
- [ ] Import queries from files
- [ ] Query templates
- [ ] Raw SQL execution
- [ ] MongoDB support
- [ ] Real-time query performance metrics
- [ ] Query sharing via URL
- [ ] Collaborative query building
- [ ] Query performance analysis
- [ ] GraphQL query generation

## License

MIT

## Links

- [GitHub](https://github.com/multipliedtwice/prisma-query-builder-ui)
- [Issues](https://github.com/multipliedtwice/prisma-query-builder-ui/issues)
- [npm](https://www.npmjs.com/package/prisma-query-builder-ui)
- [Changelog](https://github.com/multipliedtwice/prisma-query-builder-ui/blob/main/CHANGELOG.md)

## Acknowledgments

- Inspired by [Apollo Studio](https://studio.apollographql.com/) and [Prisma Studio](https://www.prisma.io/studio)
- Built with [Svelte 5](https://svelte.dev/), [SvelteKit](https://kit.svelte.dev/), and [TailwindCSS](https://tailwindcss.com/)
- Query optimization powered by [prisma-sql](https://github.com/teamdrive/prisma-sql)

---