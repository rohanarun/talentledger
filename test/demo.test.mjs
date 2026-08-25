import assert from "node:assert/strict";
import test from "node:test";
import { DemoProductClient } from "../src/demo-client.mjs";
import { manifest } from "../src/manifest.mjs";

test("sample workspace exercises every declared product action", async () => {
  const client = new DemoProductClient();
  const workspace = await client.workspace();
  assert.equal(workspace.demo, true);
  assert.deepEqual(workspace.workspace.enabledModuleIds, [manifest.module.id]);
  const initial = await client.listRecords({ limit: 100 });
  assert.ok(initial.records.length > 0);
  assert.ok(initial.records.every((record) => record.data === undefined));
  const exact = await client.listRecords({ search: initial.records[0].id, state: initial.records[0].state, limit: 100 });
  assert.deepEqual(exact.records.map((record) => record.id), [initial.records[0].id]);
  const prefix = await client.listRecords({ search: initial.records[0].title.slice(0, 4).toUpperCase(), limit: 100 });
  assert.ok(prefix.records.some((record) => record.id === initial.records[0].id));
  const detail = await client.recordDetail(initial.records[0].id);
  assert.ok(detail.record.data);
  const firstPage = await client.listRecords({ limit: 1 });
  if (firstPage.nextCursor) {
    const secondPage = await client.listRecords({ limit: 1, cursor: firstPage.nextCursor });
    assert.notEqual(secondPage.records[0].id, firstPage.records[0].id);
    await assert.rejects(client.listRecords({ limit: 1, state: firstPage.records[0].state, cursor: firstPage.nextCursor }), /cursor/i);
  }
  for (const action of manifest.actions) {
    const result = await client.runAction(action.id, action.exampleInput);
    assert.equal(result.action.id, action.id);
    assert.equal(result.demo, true);
  }
  const final = await client.listRecords({ limit: 100 });
  assert.ok(final.records.length >= initial.records.length);
});

test("every declared action output type is available through record filtering", async () => {
  const client = new DemoProductClient();
  const outputTypes = new Set(manifest.actions.map((action) => action.recordType).filter(Boolean));
  for (const recordType of outputTypes) {
    assert.ok(manifest.module.recordTypes.includes(recordType));
    const result = await client.listRecords({ recordType, limit: 100 });
    assert.ok(Array.isArray(result.records));
  }
});
