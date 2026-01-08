const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'out')
const PORT = process.env.PORT || 3020

const types = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

function safeJoin(base, target) {
  const targetPath = path.join(base, target)
  const normalized = path.normalize(targetPath)
  if (!normalized.startsWith(base)) return null
  return normalized
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = safeJoin(ROOT, urlPath)
  if (!filePath) {
    res.writeHead(400)
    return res.end('Bad request')
  }

  // Default to index.html for root or directory paths
  try {
    const stat = fs.existsSync(filePath) && fs.statSync(filePath)
    if (!stat) throw new Error('not found')
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }
  } catch {
    if (urlPath.endsWith('/')) {
      filePath = path.join(filePath, 'index.html')
    } else {
      // Try HTML fallback for clean routes like /issues
      filePath = filePath + '.html'
    }
  }

  const ext = path.extname(filePath)
  const type = types[ext] || 'application/octet-stream'
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      return res.end('Not found')
    }
    res.writeHead(200, { 'Content-Type': type })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`Previewing out/ at http://localhost:${PORT}/`)
})