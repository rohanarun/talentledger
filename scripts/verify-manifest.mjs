import assert from "node:assert/strict";
import { manifest } from "../src/manifest.mjs";
import { validateInput } from "../src/validation.mjs";

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.release.backendRelease, "v0.4.2");
assert.equal(manifest.release.backendCommit, "20c4a704c77cbbbff1da995e1d91b937625a8aa4");
assert.equal(manifest.release.backendSourceSnapshotSha256, "d0b7b1079d4924eb7369c788a979a707d45bb63470290e6ac33ee5662d78f69f");
assert.ok(manifest.actions.length > 0);
assert.ok(manifest.actions.every((action) => action.moduleId === manifest.module.id));
assert.equal(new Set(manifest.actions.map((action) => action.id)).size, manifest.actions.length);
assert.equal(new Set(manifest.actions.map((action) => action.productMcpToolName)).size, manifest.actions.length);
assert.ok(manifest.actions.every((action) => action.inputSchema?.type === "object" && action.inputSchema.additionalProperties === false));
for (const action of manifest.actions) validateInput(action.inputSchema, action.exampleInput, "actions." + action.id + ".exampleInput");
process.stdout.write(manifest.product.name + ": " + manifest.actions.length + " pinned typed actions verified.\n");
