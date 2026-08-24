import { createServer } from "node:http";

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export async function createFakeApi(moduleId) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const body = await parseBody(request);
    requests.push({ method: request.method, path: url.pathname, search: url.search, authorization: request.headers.authorization, body });
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== "Bearer test-token") {
      response.statusCode = 401;
      return response.end(JSON.stringify({ error: "Unauthorized." }));
    }
    const modulePrefix = "/api/suite/modules/" + moduleId;
    if (url.pathname === "/api/suite/workspace") return response.end(JSON.stringify({ id: "workspace-1", plan: "fleet", enabledModuleIds: [moduleId] }));
    if (url.pathname === modulePrefix + "/enable" && request.method === "POST") return response.end(JSON.stringify({ enabled: true, moduleId }));
    if (url.pathname === "/api/suite/records") return response.end(JSON.stringify({ records: [{ id: "record-1", moduleId }] }));
    if (url.pathname.startsWith("/api/suite/ai-actions/")) return response.end(JSON.stringify({ id: url.pathname.split("/").at(-1), status: "completed" }));
    if (url.pathname.startsWith(modulePrefix + "/actions/") && request.method === "POST") {
      return response.end(JSON.stringify({ ok: true, moduleId, actionId: url.pathname.split("/").at(-1), input: body.input }));
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Unknown fake route." }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: "http://127.0.0.1:" + address.port,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
