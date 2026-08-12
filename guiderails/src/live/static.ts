import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";

/**
 * Serves the built dashboard. Deliberately tiny: this is a localhost demo server, not a CDN, and a
 * dependency on express to serve four files would be worse than twenty lines.
 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

/**
 * Resolves a request path inside `dist/`, or null if it escapes.
 *
 * The check is on the resolved path rather than on the raw string because `%2e%2e` and friends are
 * already decoded by the time we see them, so pattern-matching `..` in the URL misses cases the
 * filesystem does not.
 */
export const resolveStaticFile = (dist: string, urlPath: string): string | null => {
  const decoded = (() => {
    try {
      return decodeURIComponent(urlPath);
    } catch {
      return null;
    }
  })();
  if (decoded === null) return null;

  const relative = decoded.replace(/^\/+/, "");
  // A bare "/" or any unknown path is the SPA entry point, so the client router owns it.
  const candidate = path.resolve(dist, relative === "" ? "index.html" : relative);

  const root = path.resolve(dist);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  return candidate;
};

export const serveStatic = (dist: string, urlPath: string, response: ServerResponse): void => {
  // Only a path that looks like a route falls back to the entry point. A missing font or chunk has
  // to 404: answering it with HTML turns a build problem into a baffling parse error in the console.
  const file =
    resolveStaticFile(dist, urlPath) ??
    (path.extname(urlPath) === "" ? resolveStaticFile(dist, "/index.html") : null);

  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("The dashboard has not been built.");
    return;
  }

  const extension = path.extname(file).toLowerCase();
  const isEntry = path.basename(file) === "index.html";

  response.writeHead(200, {
    "content-type": MIME[extension] ?? "application/octet-stream",
    // Vite content-hashes everything under assets/, so those are safe to keep forever. index.html
    // is not hashed and points at the current hashes, so caching it would serve a page referencing
    // assets a rebuild has already deleted.
    "cache-control": isEntry ? "no-store" : "public, max-age=31536000, immutable"
  });
  fs.createReadStream(file).pipe(response);
};
