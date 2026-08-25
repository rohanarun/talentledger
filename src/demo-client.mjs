import { randomUUID } from "node:crypto";
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
    const records = this.records
      .filter((record) => !options.recordType || record.recordType === options.recordType)
      .slice(0, options.limit ?? 50);
    return { records: clone(records), demo: true };
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
