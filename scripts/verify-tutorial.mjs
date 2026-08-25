import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { manifest } from "../src/manifest.mjs";

const [video, subtitles, proofBytes] = await Promise.all([
  readFile(new URL("../docs/tutorial.mp4", import.meta.url)),
  readFile(new URL("../docs/tutorial.srt", import.meta.url)),
  readFile(new URL("../docs/tutorial-proof.json", import.meta.url)),
]);
const proof = JSON.parse(proofBytes);
const digest = (value) => createHash("sha256").update(value).digest("hex");
assert.ok(video.length >= 200_000 && video.length <= 8 * 1024 * 1024, "The tutorial MP4 must be between 200 KB and 8 MiB.");
assert.equal(video.subarray(4, 8).toString("ascii"), "ftyp", "The tutorial must be an MP4 file.");
for (const marker of ["moov", "mdat", "avc1"]) assert.ok(video.includes(Buffer.from(marker)), "The tutorial MP4 is missing " + marker + ".");
assert.equal(proof.schema, "managed-oss-functional-tutorial.v1");
assert.equal(proof.product.slug, manifest.product.slug);
assert.equal(proof.product.moduleId, manifest.module.id);
assert.equal(proof.backend.release, manifest.release.backendRelease);
assert.equal(proof.backend.commit, manifest.release.backendCommit);
assert.equal(proof.functionalProof.action.id, manifest.experience.primaryActionId);
assert.equal(proof.functionalProof.action.httpStatus, 200);
assert.equal(proof.functionalProof.detail.httpStatus, 200);
assert.equal(proof.functionalProof.detail.matched, true);
assert.match(proof.functionalProof.record.id, /^[0-9a-f-]{36}$/);
assert.equal(proof.explanation.generation.provider, "OpenRouter");
assert.equal(proof.explanation.generation.model, "google/gemini-3.7-flash");
assert.equal(proof.explanation.cues.length, 5);
assert.equal(proof.video.overlaysBurnedIn, true);
assert.equal(proof.video.final.sha256, digest(video));
assert.equal(proof.video.subtitles.sha256, digest(subtitles));
assert.equal((subtitles.toString("utf8").match(/ --> /g) ?? []).length, 5);
assert.doesNotMatch(proofBytes.toString("utf8"), /sk-or-|authorization|127\.0\.0\.1|localhost|webKey|apiToken/i);
process.stdout.write(manifest.product.name + ": verified real-backend tutorial MP4, subtitles, and functional proof.\n");
