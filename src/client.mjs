import { actionById, manifest } from "./manifest.mjs";
import { validateInput } from "./validation.mjs";

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The API URL must be an absolute HTTP or HTTPS URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("The API URL must use HTTP or HTTPS.");
  return url.href.endsWith("/") ? url.href : url.href + "/";
}

export class ProductClient {
  constructor(options) {
    if (!options?.token || typeof options.token !== "string") throw new Error("A scoped workspace API token is required.");
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? manifest.backend.defaultUrl);
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request(path, init = {}) {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", "Bearer " + this.token);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await this.fetchImpl(new URL(path.replace(/^\//, ""), this.baseUrl), { ...init, headers });
    const text = await response.text();
    let body = {};
    if (text) {
      try { body = JSON.parse(text); } catch { body = { error: "The API returned a non-JSON response." }; }
    }
    if (!response.ok) {
      const message = body && typeof body === "object" && typeof body.error === "string" ? body.error : "Request failed with HTTP " + response.status + ".";
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  workspace() {
    return this.request("/api/suite/workspace");
  }

  enable() {
    return this.request("/api/suite/modules/" + manifest.module.id + "/enable", { method: "POST" });
  }

  listRecords(options = {}) {
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Record limit must be an integer from 1 to 200.");
    if (options.recordType && !manifest.module.recordTypes.includes(options.recordType)) throw new Error("Unknown record type for " + manifest.product.name + ".");
    const query = new URLSearchParams({ moduleId: manifest.module.id, limit: String(limit) });
    if (options.recordType) query.set("recordType", options.recordType);
    return this.request("/api/suite/records?" + query.toString());
  }

  aiStatus(actionId) {
    if (!/^[0-9a-f-]{36}$/i.test(actionId ?? "")) throw new Error("AI action ID must be a UUID.");
    return this.request("/api/suite/ai-actions/" + encodeURIComponent(actionId));
  }

  runAction(actionId, input) {
    const action = actionById.get(actionId);
    if (!action) throw new Error("Unknown " + manifest.product.name + " action: " + actionId + ".");
    validateInput(action.inputSchema, input);
    return this.request("/api/suite/modules/" + manifest.module.id + "/actions/" + encodeURIComponent(action.id), {
      method: "POST",
      body: JSON.stringify({ input }),
    });
  }
}

export function environmentConfig(env = process.env) {
  const prefix = manifest.product.environmentPrefix;
  const token = env[prefix + "_TOKEN"] ?? env.SUPERSUITE_TOKEN;
  const baseUrl = env[prefix + "_URL"] ?? env.SUPERSUITE_URL ?? manifest.backend.defaultUrl;
  if (!token) throw new Error("Set " + prefix + "_TOKEN or SUPERSUITE_TOKEN to a scoped token created in the workspace dashboard.");
  return { token, baseUrl };
}

export function clientFromEnvironment(env = process.env, fetchImpl = fetch) {
  return new ProductClient({ ...environmentConfig(env), fetchImpl });
}
