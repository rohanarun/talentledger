import assert from "node:assert/strict";
import test from "node:test";
import { ProductClient } from "../src/client.mjs";
import { manifest } from "../src/manifest.mjs";
import { createProductWebServer } from "../src/web-server.mjs";
import { createFakeApi } from "./helpers/fake-api.mjs";

test("web UI keeps the API token server-side and gates proxy calls", async (context) => {
  const fake = await createFakeApi(manifest.module.id);
  const webKey = "test-product-web-key-0001";
  const server = createProductWebServer({ client: new ProductClient({ baseUrl: fake.url, token: "test-token" }), webKey });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = "http://127.0.0.1:" + address.port;
  context.after(() => Promise.all([
    fake.close(),
    new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ]));

  const landing = await fetch(baseUrl + "/");
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), new RegExp(manifest.product.name));
  const publicManifest = await (await fetch(baseUrl + "/manifest")).json();
  assert.equal(publicManifest.module.id, manifest.module.id);
  const denied = await fetch(baseUrl + "/product-api/workspace");
  assert.equal(denied.status, 401);
  const workspace = await fetch(baseUrl + "/product-api/workspace", { headers: { "X-Product-Web-Key": webKey } });
  assert.equal(workspace.status, 200);
  assert.equal((await workspace.json()).id, "workspace-1");
  const records = await fetch(baseUrl + "/product-api/records?recordType=" + encodeURIComponent(manifest.module.recordTypes[0]) + "&state=review&search=Beta&limit=100&cursor=opaque-next-page", { headers: { "X-Product-Web-Key": webKey } });
  assert.equal(records.status, 200);
  const page = await records.json();
  assert.equal(page.records[0].data, undefined);
  const detail = await fetch(baseUrl + "/product-api/records/" + page.records[0].id, { headers: { "X-Product-Web-Key": webKey } });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).record.data.privatePayload, "detail-only");
  const pageRequest = fake.requests.find((request) => request.path === "/api/suite/modules/" + manifest.module.id + "/records");
  assert.match(pageRequest.search, /state=review/);
  assert.match(pageRequest.search, /search=Beta/);
  assert.match(pageRequest.search, /cursor=opaque-next-page/);
  assert.ok(fake.requests.every((request) => request.authorization === "Bearer test-token"));
});
