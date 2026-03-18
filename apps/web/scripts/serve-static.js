const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const rootDir = path.resolve(process.cwd(), process.argv[2] || "out");
const port = Number(process.argv[3] || 3011);
const host = process.argv[4] || "0.0.0.0";
const apiProxyHost = process.env.API_PROXY_HOST || "127.0.0.1";
const apiProxyPort = Number(process.env.API_PROXY_PORT || 8000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function resolvePath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = normalized === path.sep ? "" : normalized;

  const candidates = [
    path.join(rootDir, requestedPath),
    path.join(rootDir, requestedPath, "index.html"),
    path.join(rootDir, `${requestedPath}.html`)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return path.join(rootDir, "404.html");
}

const server = http.createServer((request, response) => {
  if ((request.url || "").startsWith("/api/")) {
    const proxy = http.request(
      {
        hostname: apiProxyHost,
        port: apiProxyPort,
        path: request.url,
        method: request.method,
        headers: {
          ...request.headers,
          host: `${apiProxyHost}:${apiProxyPort}`
        }
      },
      (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
        proxyResponse.pipe(response);
      }
    );

    proxy.on("error", (error) => {
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          detail: "API indisponivel",
          error: error.message
        })
      );
    });

    request.pipe(proxy);
    return;
  }

  const filePath = resolvePath(request.url || "/");

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(filePath.endsWith("404.html") ? 404 : 200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });

  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Static web listening on http://${host}:${port}`);
});
