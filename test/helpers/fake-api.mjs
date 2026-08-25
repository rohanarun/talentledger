import { createServer } from "node:http";

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export async function createFakeApi(moduleId) {
  const requests = [];
  const records = [
    { id: "00000000-0000-4000-8000-000000000001", moduleId, recordType: "sample-record", title: "Alpha record", state: "active", createdAt: "2026-08-24T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z" },
    { id: "00000000-0000-4000-8000-000000000002", moduleId, recordType: "sample-record", title: "Beta record", state: "review", createdAt: "2026-08-23T12:00:00.000Z", updatedAt: "2026-08-24T12:00:00.000Z" },
  ];
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
    if (url.pathname === modulePrefix + "/records" && request.method === "GET") {
      const page = url.searchParams.has("cursor") ? records.slice(1) : records.slice(0, 1);
      return response.end(JSON.stringify({
        records: page,
        nextCursor: url.searchParams.has("cursor") ? undefined : "opaque-next-page",
        capabilities: { version: "module-read-model.v1", moduleId, recordDetail: true, recordPage: { maxLimit: 100 } },
      }));
    }
    if (url.pathname.startsWith(modulePrefix + "/records/") && request.method === "GET") {
      const record = records.find((candidate) => candidate.id === decodeURIComponent(url.pathname.slice((modulePrefix + "/records/").length)));
      if (record) return response.end(JSON.stringify({ record: { ...record, data: { privatePayload: "detail-only" } } }));
      response.statusCode = 404;
      return response.end(JSON.stringify({ error: "Record not found." }));
    }
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
