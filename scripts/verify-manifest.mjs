import assert from "node:assert/strict";
import { manifest } from "../src/manifest.mjs";
import { validateInput } from "../src/validation.mjs";

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.release.backendRelease, "v0.4.3");
assert.equal(manifest.release.backendCommit, "6947288c99d77f6391beb56211a6750c229a58d2");
assert.equal(manifest.release.backendSourceSnapshotSha256, "2a97e3dd83247132d34fd65b6a217e6eb151d9fb3ecff87bfb062e16aa2cff3f");
assert.ok(manifest.actions.length > 0);
assert.ok(manifest.actions.every((action) => action.moduleId === manifest.module.id));
assert.equal(new Set(manifest.actions.map((action) => action.id)).size, manifest.actions.length);
assert.equal(new Set(manifest.actions.map((action) => action.productMcpToolName)).size, manifest.actions.length);
assert.ok(manifest.actions.every((action) => action.inputSchema?.type === "object" && action.inputSchema.additionalProperties === false));
assert.ok(manifest.actions.every((action) => !action.recordType || manifest.module.recordTypes.includes(action.recordType)), "Every action output record type must be listable by web, CLI, and MCP clients.");
assert.equal(manifest.experience.primaryActionId, manifest.actions.find((action) => action.id === manifest.experience.primaryActionId)?.id);
assert.ok(manifest.experience.workflowGroups.flatMap((group) => group.actionIds).length === manifest.actions.length, "Every action must appear in exactly one guided workflow group.");
if (manifest.actions.find((action) => action.id === manifest.experience.primaryActionId)?.operation === "create") {
  assert.ok(manifest.experience.workflowGroups.find((group) => group.name === "Create and capture")?.actionIds.includes(manifest.experience.primaryActionId), "A primary create action must lead the Create and capture workflow group.");
}
for (const action of manifest.actions) validateInput(action.inputSchema, action.exampleInput, "actions." + action.id + ".exampleInput");
process.stdout.write(manifest.product.name + ": " + manifest.actions.length + " pinned typed actions verified.\n");
