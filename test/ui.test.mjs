import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { manifest } from "../src/manifest.mjs";

test("product UI exposes overview, records, workflows, AI, settings, and guided forms", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("../web/index.html", import.meta.url), "utf8"),
    readFile(new URL("../web/app.js", import.meta.url), "utf8"),
    readFile(new URL("../web/styles.css", import.meta.url), "utf8"),
  ]);
  for (const view of ["overview", "records", "workflows", "ai", "settings"]) {
    assert.match(html, new RegExp("data-view=\\\"" + view + "\\\""));
    assert.match(html, new RegExp("id=\\\"view-" + view + "\\\""));
  }
  assert.match(html, /id="action-form"/);
  assert.match(html, /id="record-state-filter"/);
  assert.match(html, /id="load-more-records"/);
  assert.match(app, /function createField/);
  assert.match(app, /manifest\.experience\.workflowGroups/);
  assert.match(app, /query\.set\("search", state\.recordQuery\.trim\(\)\)/);
  assert.match(app, /query\.set\("state", state\.recordState\.trim\(\)\)/);
  assert.match(app, /query\.set\("cursor", cursor\)/);
  assert.match(app, /\/product-api\/records\/" \+ encodeURIComponent\(recordId\)/);
  assert.doesNotMatch(app, /JSON\.stringify\(record\.data\)/);
  assert.doesNotMatch(app, /function filteredRecords/);
  assert.doesNotMatch(html, /<body[^>]+style=/);
  assert.match(css, new RegExp("--accent:\\s*" + manifest.product.accent.replace("#", "\\#"), "i"));
  assert.match(css, /grid-auto-flow:\s*dense/);
});
