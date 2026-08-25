import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { manifest } from "../src/manifest.mjs";
import { createFakeApi } from "./helpers/fake-api.mjs";

function mcpSession(env) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/mcp.mjs", import.meta.url))], { env, stdio: ["pipe", "pipe", "pipe"] });
  const replies = new Map();
  const waiters = new Map();
  let buffer = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      replies.set(message.id, message);
      waiters.get(message.id)?.(message);
      waiters.delete(message.id);
    }
  });
  return {
    request(message) {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
      if (replies.has(message.id)) return Promise.resolve(replies.get(message.id));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for MCP response " + message.id + ". stderr: " + stderr)), 5000);
        waiters.set(message.id, (value) => { clearTimeout(timer); resolve(value); });
      });
    },
    async close() {
      child.stdin.end();
      await new Promise((resolve) => child.once("exit", resolve));
      assert.equal(stderr, "");
    },
  };
}

test("stdio MCP advertises and calls only this product's typed tools", async (context) => {
  const fake = await createFakeApi(manifest.module.id);
  context.after(() => fake.close());
  const env = {
    ...process.env,
    [manifest.product.environmentPrefix + "_TOKEN"]: "test-token",
    [manifest.product.environmentPrefix + "_URL"]: fake.url,
  };
  const session = mcpSession(env);
  context.after(() => session.close());
  const initialized = await session.request({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  assert.equal(initialized.result.serverInfo.name, manifest.product.slug);
  const listed = await session.request({ id: 2, method: "tools/list", params: {} });
  assert.equal(listed.result.tools.length, manifest.actions.length + 5);
  const productNames = new Set(manifest.actions.map((action) => action.productMcpToolName));
  assert.ok(listed.result.tools.filter((tool) => productNames.has(tool.name)).every((tool) => tool.inputSchema.type === "object"));
  const listName = manifest.product.mcpPrefix + "_list_records";
  const detailName = manifest.product.mcpPrefix + "_record_detail";
  const listTool = listed.result.tools.find((tool) => tool.name === listName);
  assert.equal(listTool.inputSchema.properties.limit.maximum, 100);
  assert.deepEqual(Object.keys(listTool.inputSchema.properties).sort(), ["cursor", "limit", "recordType", "search", "state"]);
  const page = await session.request({ id: 3, method: "tools/call", params: { name: listName, arguments: { recordType: manifest.module.recordTypes[0], state: "review", search: "Beta", limit: 100, cursor: "opaque-next-page" } } });
  assert.equal(page.result.isError, undefined);
  assert.equal(page.result.structuredContent.result.records[0].data, undefined);
  const detail = await session.request({ id: 4, method: "tools/call", params: { name: detailName, arguments: { recordId: page.result.structuredContent.result.records[0].id } } });
  assert.equal(detail.result.structuredContent.result.record.data.privatePayload, "detail-only");
  const action = manifest.actions[0];
  const called = await session.request({ id: 5, method: "tools/call", params: { name: action.productMcpToolName, arguments: action.exampleInput } });
  assert.equal(called.result.isError, undefined);
  assert.equal(called.result.structuredContent.result.moduleId, manifest.module.id);
});
