import assert from "node:assert/strict";
import test from "node:test";
import { ProductClient } from "../src/client.mjs";
import { manifest } from "../src/manifest.mjs";
import { createFakeApi } from "./helpers/fake-api.mjs";

test("manifest is pinned and every action is product scoped", () => {
  assert.equal(manifest.release.backendRelease, "v0.4.4");
  assert.equal(manifest.release.backendCommit, "148abce99b91d8b9fdc8aa41c3f0eba283796db4");
  assert.ok(manifest.actions.length > 0);
  assert.ok(manifest.actions.every((action) => action.moduleId === manifest.module.id));
  assert.equal(new Set(manifest.actions.map((action) => action.id)).size, manifest.actions.length);
  assert.ok(manifest.actions.every((action) => action.inputSchema?.type === "object"));
});

test("client uses bearer auth and cannot escape its fixed module", async (context) => {
  const fake = await createFakeApi(manifest.module.id);
  context.after(() => fake.close());
  const client = new ProductClient({ baseUrl: fake.url, token: "test-token" });
  const workspace = await client.workspace();
  assert.equal(workspace.id, "workspace-1");
  const pageOptions = { recordType: manifest.module.recordTypes[0], state: "active", search: "Alpha", limit: 100 };
  const records = await client.listRecords(pageOptions);
  assert.equal(records.records[0].moduleId, manifest.module.id);
  assert.equal(records.records[0].data, undefined);
  assert.equal(records.nextCursor, "opaque-next-page");
  const next = await client.listRecords({ ...pageOptions, cursor: records.nextCursor });
  assert.equal(next.records[0].id, "00000000-0000-4000-8000-000000000002");
  const detail = await client.recordDetail(records.records[0].id);
  assert.equal(detail.record.data.privatePayload, "detail-only");
  const action = manifest.actions[0];
  const result = await client.runAction(action.id, action.exampleInput);
  assert.equal(result.moduleId, manifest.module.id);
  assert.equal(result.actionId, action.id);
  assert.ok(fake.requests.every((request) => request.authorization === "Bearer test-token"));
  const pageRequest = fake.requests.find((request) => request.path === "/api/suite/modules/" + manifest.module.id + "/records" && !request.search.includes("cursor="));
  assert.equal(new URLSearchParams(pageRequest.search).get("recordType"), manifest.module.recordTypes[0]);
  assert.equal(new URLSearchParams(pageRequest.search).get("state"), "active");
  assert.equal(new URLSearchParams(pageRequest.search).get("search"), "Alpha");
  assert.equal(new URLSearchParams(pageRequest.search).get("limit"), "100");
  assert.ok(fake.requests.some((request) => request.path === "/api/suite/modules/" + manifest.module.id + "/records/" + records.records[0].id));
  assert.ok(fake.requests.every((request) => request.path !== "/api/suite/records"));
  assert.ok(fake.requests.some((request) => request.path === "/api/suite/modules/" + manifest.module.id + "/actions/" + action.id));
  assert.throws(() => client.listRecords({ limit: 101 }), /1 to 100/);
  assert.throws(() => client.recordDetail("not-a-uuid"), /UUID/);
  assert.throws(() => client.runAction("not-a-product-action", {}), /Unknown/);
  assert.throws(() => client.runAction(action.id, {}), /required/);
});
