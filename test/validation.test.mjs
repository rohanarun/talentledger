import assert from "node:assert/strict";
import test from "node:test";
import { validateInput } from "../src/validation.mjs";

test("validator enforces unique arrays structurally", () => {
  const schema = {
    type: "array",
    uniqueItems: true,
    items: {
      type: "object",
      required: ["key"],
      properties: { key: { type: "string" } },
      additionalProperties: false,
    },
  };
  validateInput(schema, [{ key: "first" }, { key: "second" }]);
  assert.throws(() => validateInput(schema, [{ key: "duplicate" }, { key: "duplicate" }]), /must be unique/);
});

test("validator enforces dynamic object key, size, and value schemas", () => {
  const schema = {
    type: "object",
    minProperties: 1,
    maxProperties: 2,
    propertyNames: { pattern: "^[a-z]+$" },
    additionalProperties: { type: "integer", minimum: 0 },
  };
  validateInput(schema, { accepted: 1 });
  assert.throws(() => validateInput(schema, {}), /at least 1 property/);
  assert.throws(() => validateInput(schema, { first: 1, second: 2, third: 3 }), /at most 2 properties/);
  assert.throws(() => validateInput(schema, { "Not-valid": 1 }), /required pattern/);
  assert.throws(() => validateInput(schema, { accepted: "wrong" }), /must be an integer/);
});
