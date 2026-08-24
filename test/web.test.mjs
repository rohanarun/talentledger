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

  const page = await fetch(baseUrl + "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), new RegExp(manifest.product.name));
  const publicManifest = await (await fetch(baseUrl + "/manifest")).json();
  assert.equal(publicManifest.module.id, manifest.module.id);
  const denied = await fetch(baseUrl + "/product-api/workspace");
  assert.equal(denied.status, 401);
  const workspace = await fetch(baseUrl + "/product-api/workspace", { headers: { "X-Product-Web-Key": webKey } });
  assert.equal(workspace.status, 200);
  assert.equal((await workspace.json()).id, "workspace-1");
  assert.ok(fake.requests.every((request) => request.authorization === "Bearer test-token"));
});
