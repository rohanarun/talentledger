import assert from "node:assert/strict";
import test from "node:test";
import { DemoProductClient } from "../src/demo-client.mjs";
import { manifest } from "../src/manifest.mjs";

test("sample workspace exercises every declared product action", async () => {
  const client = new DemoProductClient();
  const workspace = await client.workspace();
  assert.equal(workspace.demo, true);
  assert.deepEqual(workspace.workspace.enabledModuleIds, [manifest.module.id]);
  const initial = await client.listRecords({ limit: 200 });
  assert.ok(initial.records.length > 0);
  for (const action of manifest.actions) {
    const result = await client.runAction(action.id, action.exampleInput);
    assert.equal(result.action.id, action.id);
    assert.equal(result.demo, true);
  }
  const final = await client.listRecords({ limit: 200 });
  assert.ok(final.records.length >= initial.records.length);
});

test("every declared action output type is available through record filtering", async () => {
  const client = new DemoProductClient();
  const outputTypes = new Set(manifest.actions.map((action) => action.recordType).filter(Boolean));
  for (const recordType of outputTypes) {
    assert.ok(manifest.module.recordTypes.includes(recordType));
    const result = await client.listRecords({ recordType, limit: 200 });
    assert.ok(Array.isArray(result.records));
  }
});
