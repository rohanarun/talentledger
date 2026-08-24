import { readFileSync } from "node:fs";

const manifestUrl = new URL("../product-manifest.json", import.meta.url);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const manifest = deepFreeze(JSON.parse(readFileSync(manifestUrl, "utf8")));
export const product = manifest.product;
export const moduleDefinition = manifest.module;
export const actions = manifest.actions;
export const actionById = new Map(actions.map((action) => [action.id, action]));
export const actionByToolName = new Map(actions.map((action) => [action.productMcpToolName, action]));
