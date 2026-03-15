
import express from 'express'
import { startQueryBuilder, stopQueryBuilder } from './start-query-builder.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = 3000

// Serve static files from embedded-demo/public/
app.use(express.static(path.join(__dirname, 'public')))

// Sample API endpoints
app.get('/api/users', (req, res) => {
  res.json({
    users: [
      { id: 1, email: 'alice@example.com', name: 'Alice' },
      { id: 2, email: 'bob@example.com', name: 'Bob' }
    ]
  })
})

app.get('/api/posts', (req, res) => {
  res.json({
    posts: [
      { id: 1, title: 'Hello World', authorId: 1 },
      { id: 2, title: 'Embedded Mode Demo', authorId: 2 }
    ]
  })
})

// Start the demo server
const server = app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║        Prisma Query Builder - Embedded Demo           ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`🚀 Demo Server:     http://localhost:${PORT}`)
  console.log(`📚 Documentation:   http://localhost:${PORT}/`)
  console.log(`🔧 Query Builder:   http://localhost:5173`)
  console.log()
  console.log('Press Ctrl+C to stop')
  console.log()
})

// Start query builder in embedded mode
// Schema path: embedded-demo/schema.prisma
// Database path: embedded-demo/demo.db (relative to schema)
startQueryBuilder({
  port: 5173,
  schemaPath: path.join(__dirname, 'schema.prisma'),
  databaseUrl: `file:${path.join(__dirname, 'demo.db')}`
})

// Graceful shutdown
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

function shutdown() {
  console.log('\n🛑 Shutting down gracefully...')
  
  stopQueryBuilder()
  
  server.close(() => {
    console.log('✅ Server stopped')
    process.exit(0)
  })
  
  setTimeout(() => {
    console.error('⚠️  Forced shutdown')
    process.exit(1)
  }, 5000)
}