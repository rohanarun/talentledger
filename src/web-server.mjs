#!/usr/bin/env node
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { clientFromEnvironment } from "./client.mjs";
import { DemoProductClient } from "./demo-client.mjs";
import { manifest } from "./manifest.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const webRoot = join(directory, "..", "web");
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(body));
}

function secureEqual(left, right) {
  const a = Buffer.from(left ?? "");
  const b = Buffer.from(right ?? "");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_048_576) throw new Error("Request body exceeds 1 MiB.");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Request body must be valid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be a JSON object.");
  return parsed;
}

export function webKeyFromEnvironment(env = process.env) {
  const key = env[manifest.product.environmentPrefix + "_WEB_KEY"] ?? env.PRODUCT_WEB_KEY;
  if (!key || key.length < 24) throw new Error("Set " + manifest.product.environmentPrefix + "_WEB_KEY or PRODUCT_WEB_KEY to at least 24 characters.");
  return key;
}

export function createProductWebServer({ client, webKey }) {
  if (!client) throw new Error("A product client is required.");
  if (!webKey || webKey.length < 24) throw new Error("The product web key must contain at least 24 characters.");
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/health") return jsonResponse(response, 200, { ok: true, product: manifest.product.slug, version: manifest.release.productVersion });
      if (url.pathname === "/manifest") return jsonResponse(response, 200, manifest);

      const staticEntry = staticFiles.get(url.pathname);
      if (staticEntry && request.method === "GET") {
        const [file, contentType] = staticEntry;
        const content = await readFile(join(webRoot, file));
        response.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        });
        return response.end(content);
      }

      if (!url.pathname.startsWith("/product-api/")) return jsonResponse(response, 404, { error: "Not found." });
      if (!secureEqual(request.headers["x-product-web-key"], webKey)) return jsonResponse(response, 401, { error: "A valid product web key is required." });

      let result;
      if (request.method === "GET" && url.pathname === "/product-api/workspace") result = await client.workspace();
      else if (request.method === "POST" && url.pathname === "/product-api/enable") result = await client.enable();
      else if (request.method === "GET" && url.pathname === "/product-api/records") result = await client.listRecords({
        recordType: url.searchParams.get("recordType") || undefined,
        state: url.searchParams.get("state") || undefined,
        search: url.searchParams.get("search") || undefined,
        limit: Number(url.searchParams.get("limit") ?? 50),
        cursor: url.searchParams.get("cursor") || undefined,
      });
      else if (request.method === "GET" && url.pathname.startsWith("/product-api/records/")) result = await client.recordDetail(decodeURIComponent(url.pathname.slice("/product-api/records/".length)));
      else if (request.method === "GET" && url.pathname.startsWith("/product-api/ai-actions/")) result = await client.aiStatus(decodeURIComponent(url.pathname.slice("/product-api/ai-actions/".length)));
      else if (request.method === "POST" && url.pathname.startsWith("/product-api/actions/")) {
        const actionId = decodeURIComponent(url.pathname.slice("/product-api/actions/".length));
        const body = await requestBody(request);
        result = await client.runAction(actionId, body.input);
      } else return jsonResponse(response, 404, { error: "Not found." });
      return jsonResponse(response, 200, result);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : error?.name === "InputValidationError" ? 400 : 502;
      return jsonResponse(response, status, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export async function startWebServer(env = process.env) {
  const host = env.HOST ?? "127.0.0.1";
  const port = Number(env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535.");
  const demoMode = env.PRODUCT_DEMO_MODE === "true";
  const server = createProductWebServer({ client: demoMode ? new DemoProductClient() : clientFromEnvironment(env), webKey: webKeyFromEnvironment(env) });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  process.stdout.write(manifest.product.name + " web UI listening on http://" + host + ":" + port + (demoMode ? " in sample workspace mode" : "") + "\n");
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWebServer().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
