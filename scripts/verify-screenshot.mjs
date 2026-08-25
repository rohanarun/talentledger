import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { manifest } from "../src/manifest.mjs";

const path = new URL("../docs/product-workspace.png", import.meta.url);
const image = await readFile(path);
assert.ok(image.length > 50_000, "The product screenshot must be a real rendered PNG larger than 50 KB.");
assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "The product screenshot must have a valid PNG signature.");
const width = image.readUInt32BE(16);
const height = image.readUInt32BE(20);
assert.equal(width, 1440, "The product screenshot width must be exactly 1440 pixels.");
assert.equal(height, 1000, "The product screenshot height must be exactly 1000 pixels.");
process.stdout.write(manifest.product.name + ": verified " + width + "x" + height + " product screenshot.\n");
