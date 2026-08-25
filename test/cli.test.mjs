import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { manifest } from "../src/manifest.mjs";
import { createFakeApi } from "./helpers/fake-api.mjs";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

test("CLI exposes only pinned product actions", async () => {
  const { stdout } = await execute(process.execPath, [cli, "actions"]);
  const actions = JSON.parse(stdout);
  assert.equal(actions.length, manifest.actions.length);
  assert.ok(actions.every((action) => action.moduleId === manifest.module.id));
});

test("CLI invokes the fixed product endpoint", async (context) => {
  const fake = await createFakeApi(manifest.module.id);
  context.after(() => fake.close());
  const action = manifest.actions[0];
  const env = {
    ...process.env,
    [manifest.product.environmentPrefix + "_TOKEN"]: "test-token",
    [manifest.product.environmentPrefix + "_URL"]: fake.url,
  };
  const pageOptions = { recordType: manifest.module.recordTypes[0], state: "active", search: "Alpha", limit: 100, cursor: "opaque-page" };
  const { stdout: pageOutput } = await execute(process.execPath, [cli, "page", JSON.stringify(pageOptions)], { env });
  const page = JSON.parse(pageOutput);
  assert.equal(page.records[0].moduleId, manifest.module.id);
  assert.equal(page.records[0].data, undefined);
  const { stdout: detailOutput } = await execute(process.execPath, [cli, "detail", page.records[0].id], { env });
  assert.equal(JSON.parse(detailOutput).record.data.privatePayload, "detail-only");
  const { stdout } = await execute(process.execPath, [cli, "action", action.id, JSON.stringify(action.exampleInput)], { env });
  const result = JSON.parse(stdout);
  assert.equal(result.moduleId, manifest.module.id);
  assert.equal(result.actionId, action.id);
  const pageRequest = fake.requests.find((request) => request.path === "/api/suite/modules/" + manifest.module.id + "/records");
  assert.match(pageRequest.search, /state=active/);
  assert.match(pageRequest.search, /search=Alpha/);
  assert.match(pageRequest.search, /cursor=opaque-page/);
});
