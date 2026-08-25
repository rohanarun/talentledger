import { createHash, randomUUID } from "node:crypto";
import { actionById, manifest } from "./manifest.mjs";
import { validateInput } from "./validation.mjs";

function clone(value) {
  return structuredClone(value);
}

function titleForAction(action, input) {
  const preferredKeys = [action.titleField, "name", "title", "subject", "label", "slug", "externalKey"].filter(Boolean);
  for (const key of preferredKeys) {
    if (typeof input[key] === "string" && input[key].trim()) return input[key].trim();
  }
  return action.title;
}

function demoInputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizePageOptions(options = {}) {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw demoInputError("Record limit must be an integer from 1 to 100.");
  const normalize = (value, name, maximumLength = 200) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") throw demoInputError(name + " must be a string.");
    const normalized = value.trim();
    if (!normalized || normalized.length > maximumLength) throw demoInputError(name + " must contain from 1 to " + maximumLength + " characters.");
    return normalized;
  };
  const recordType = normalize(options.recordType, "Record type");
  if (recordType && !manifest.module.recordTypes.includes(recordType)) throw demoInputError("Unknown record type for " + manifest.product.name + ".");
  return {
    recordType,
    state: normalize(options.state, "Record state"),
    search: normalize(options.search, "Record search")?.toLowerCase(),
    cursor: normalize(options.cursor, "Record cursor", 2_048),
    limit,
  };
}

function pageFingerprint(options) {
  return createHash("sha256").update(JSON.stringify({
    version: 1,
    moduleId: manifest.module.id,
    recordType: options.recordType ?? null,
    state: options.state ?? null,
    search: options.search ?? null,
    order: "updatedAt-desc-id-desc",
  })).digest("base64url");
}

function decodePageCursor(value, fingerprint) {
  if (!value) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (claims?.version !== 1 || claims.fingerprint !== fingerprint || typeof claims.updatedAt !== "string" || !Number.isFinite(Date.parse(claims.updatedAt)) || typeof claims.id !== "string" || !claims.id) throw new Error("invalid");
    return claims;
  } catch {
    throw demoInputError("Record cursor is invalid for this page query.");
  }
}

function encodePageCursor(record, fingerprint) {
  return Buffer.from(JSON.stringify({ version: 1, fingerprint, updatedAt: record.updatedAt, id: record.id })).toString("base64url");
}

function compareRecords(left, right) {
  const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
  return byUpdatedAt || right.id.localeCompare(left.id);
}

function isAfterCursor(record, cursor) {
  return !cursor || record.updatedAt < cursor.updatedAt || (record.updatedAt === cursor.updatedAt && record.id < cursor.id);
}

function recordSummary(record) {
  return {
    id: record.id,
    moduleId: record.moduleId,
    recordType: record.recordType,
    title: record.title,
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function readCapabilities() {
  return {
    version: "module-read-model.v1",
    moduleId: manifest.module.id,
    name: manifest.product.name,
    category: manifest.module.category,
    recordTypes: [...manifest.module.recordTypes],
    aiCapabilities: [...manifest.module.aiCapabilities],
    recordPage: { defaultLimit: 50, maxLimit: 100, order: "updatedAt-desc-id-desc", filters: ["recordType", "state", "titlePrefixOrExactId"] },
    recordDetail: true,
  };
}

export class DemoProductClient {
  constructor() {
    this.records = clone(manifest.experience.sampleRecords ?? []);
    this.aiActions = new Map();
    this.enabled = true;
  }

  async workspace() {
    return {
      workspace: {
        id: "demo-workspace",
        slug: "sample-workspace",
        name: "Sample workspace",
        plan: manifest.module.minimumHostedPlan,
        enabledModuleIds: this.enabled ? [manifest.module.id] : [],
      },
      usage: {
        recordCount: this.records.length,
        aiActionsThisMonth: this.aiActions.size,
        storageBytes: 0,
      },
      demo: true,
    };
  }

  async enable() {
    this.enabled = true;
    return { enabled: true, moduleId: manifest.module.id, demo: true };
  }

  async listRecords(options = {}) {
    const normalized = normalizePageOptions(options);
    const fingerprint = pageFingerprint(normalized);
    const cursor = decodePageCursor(normalized.cursor, fingerprint);
    const matching = this.records
      .filter((record) => !normalized.recordType || record.recordType === normalized.recordType)
      .filter((record) => !normalized.state || record.state === normalized.state)
      .filter((record) => !normalized.search || record.id.toLowerCase() === normalized.search || record.title.toLowerCase().startsWith(normalized.search))
      .filter((record) => isAfterCursor(record, cursor))
      .sort(compareRecords);
    const records = matching.slice(0, normalized.limit);
    return {
      records: records.map(recordSummary),
      nextCursor: matching.length > normalized.limit ? encodePageCursor(records.at(-1), fingerprint) : undefined,
      capabilities: readCapabilities(),
      demo: true,
    };
  }

  async recordDetail(recordId) {
    const record = this.records.find((candidate) => candidate.id === recordId);
    if (!record) {
      const error = new Error("Record not found.");
      error.status = 404;
      throw error;
    }
    return { record: clone(record), demo: true };
  }

  async aiStatus(actionId) {
    const action = this.aiActions.get(actionId);
    if (!action) {
      const error = new Error("Demo AI action not found.");
      error.status = 404;
      throw error;
    }
    return { action: clone(action), demo: true };
  }

  async runAction(actionId, input) {
    const action = actionById.get(actionId);
    if (!action) throw new Error("Unknown " + manifest.product.name + " action: " + actionId + ".");
    validateInput(action.inputSchema, input);
    const now = new Date().toISOString();
    if (action.requiredScope === "ai" || action.operation === "ai") {
      const aiAction = {
        id: randomUUID(),
        moduleId: manifest.module.id,
        actionId: action.id,
        status: "completed",
        goal: action.title,
        result: { proposal: "Sample evidence-bound proposal", evidenceRecordIds: this.records.slice(0, 2).map((record) => record.id) },
        createdAt: now,
        completedAt: now,
      };
      this.aiActions.set(aiAction.id, aiAction);
      return { kind: "ai-action", action, aiAction: clone(aiAction), records: clone(this.records.slice(0, 2)), demo: true };
    }

    const referenced = Object.values(input).filter((value) => typeof value === "string").find((value) => this.records.some((record) => record.id === value));
    const recordType = action.recordType || manifest.module.recordTypes[0] || "record";
    let record = referenced ? this.records.find((candidate) => candidate.id === referenced) : undefined;
    if (action.operation === "create" || !record) {
      record = {
        id: randomUUID(),
        moduleId: manifest.module.id,
        recordType,
        title: titleForAction(action, input),
        state: action.resultingState || "active",
        data: { ...clone(input), lastActionId: action.id, evidenceStatus: "sample" },
        createdAt: now,
        updatedAt: now,
      };
      this.records.unshift(record);
    } else {
      record = { ...record, state: action.resultingState || record.state, data: { ...record.data, ...clone(input), lastActionId: action.id }, updatedAt: now };
      this.records = this.records.map((candidate) => candidate.id === record.id ? record : candidate);
    }
    return {
      kind: action.operation === "read" ? "read" : action.operation === "create" ? "record" : "command",
      action,
      record: action.operation === "create" ? clone(record) : undefined,
      records: action.operation === "create" ? undefined : [clone(record)],
      audit: { demo: true, executedAt: now, actionId: action.id },
      demo: true,
    };
  }
}
