import assert from "node:assert/strict";
import test from "node:test";
import { ProductClient } from "../src/client.mjs";
import { manifest } from "../src/manifest.mjs";
import { createFakeApi } from "./helpers/fake-api.mjs";

test("manifest is pinned and every action is product scoped", () => {
  assert.equal(manifest.release.backendRelease, "v0.4.2");
  assert.equal(manifest.release.backendCommit, "20c4a704c77cbbbff1da995e1d91b937625a8aa4");
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
  const records = await client.listRecords({ limit: 25 });
  assert.equal(records.records[0].moduleId, manifest.module.id);
  const action = manifest.actions[0];
  const result = await client.runAction(action.id, action.exampleInput);
  assert.equal(result.moduleId, manifest.module.id);
  assert.equal(result.actionId, action.id);
  assert.ok(fake.requests.every((request) => request.authorization === "Bearer test-token"));
  assert.ok(fake.requests.some((request) => request.path === "/api/suite/modules/" + manifest.module.id + "/actions/" + action.id));
  assert.throws(() => client.runAction("not-a-product-action", {}), /Unknown/);
  assert.throws(() => client.runAction(action.id, {}), /required/);
});
