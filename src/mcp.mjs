#!/usr/bin/env node
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { actionByToolName, actions, manifest } from "./manifest.mjs";
import { clientFromEnvironment } from "./client.mjs";
import { validateInput } from "./validation.mjs";

const prefix = manifest.product.mcpPrefix;
const builtInNames = {
  workspace: prefix + "_workspace",
  enable: prefix + "_enable",
  list: prefix + "_list_records",
  aiStatus: prefix + "_ai_status",
};

function toolAnnotations(action) {
  return {
    readOnlyHint: action.operation === "read",
    destructiveHint: action.destructive === true,
    idempotentHint: action.idempotent === true,
    openWorldHint: false,
  };
}

export function productTools() {
  return [
    {
      name: builtInNames.workspace,
      title: "Read " + manifest.product.name + " workspace",
      description: "Read the authenticated workspace and enabled modules. Requires read scope.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: builtInNames.enable,
      title: "Enable " + manifest.product.name,
      description: "Enable this product module after the hosted plan gate succeeds. Requires write scope.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: builtInNames.list,
      title: "List " + manifest.product.name + " records",
      description: "List records owned by this product module. Requires read scope.",
      inputSchema: {
        type: "object",
        properties: {
          recordType: { type: "string", enum: manifest.module.recordTypes },
          limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: builtInNames.aiStatus,
      title: "Read " + manifest.product.name + " AI action status",
      description: "Read a queued, running, completed, or failed AI action. Requires read scope.",
      inputSchema: {
        type: "object",
        required: ["actionId"],
        properties: { actionId: { type: "string", format: "uuid" } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ...actions.map((action) => ({
      name: action.productMcpToolName,
      title: action.title,
      description: action.description + " Requires " + action.requiredScope + " scope.",
      inputSchema: action.inputSchema,
      annotations: toolAnnotations(action),
    })),
  ];
}

function result(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value },
  };
}

function errorResult(error) {
  return {
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  };
}

export async function callProductTool(name, args, client) {
  if (name === builtInNames.workspace) return result(await client.workspace());
  if (name === builtInNames.enable) return result(await client.enable());
  if (name === builtInNames.list) return result(await client.listRecords(args ?? {}));
  if (name === builtInNames.aiStatus) {
    validateInput(productTools().find((tool) => tool.name === builtInNames.aiStatus).inputSchema, args ?? {});
    return result(await client.aiStatus(args.actionId));
  }
  const action = actionByToolName.get(name);
  if (!action) throw new Error("Unknown " + manifest.product.name + " tool: " + name + ".");
  return result(await client.runAction(action.id, args ?? {}));
}

function response(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function protocolError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function handleMcpMessage(message, client) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return protocolError(message?.id, -32600, "Invalid Request");
  if (message.id === undefined) return undefined;
  if (message.method === "initialize") {
    return response(message.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: manifest.product.slug, version: manifest.release.productVersion },
      instructions: manifest.product.tagline,
    });
  }
  if (message.method === "ping") return response(message.id, {});
  if (message.method === "tools/list") return response(message.id, { tools: productTools() });
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (typeof name !== "string") return protocolError(message.id, -32602, "Tool name is required.");
    try {
      return response(message.id, await callProductTool(name, message.params?.arguments ?? {}, client));
    } catch (error) {
      return response(message.id, errorResult(error));
    }
  }
  return protocolError(message.id, -32601, "Method not found: " + message.method);
}

export async function runStdio() {
  const client = clientFromEnvironment();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch {
      process.stdout.write(JSON.stringify(protocolError(null, -32700, "Parse error")) + "\n");
      continue;
    }
    const reply = await handleMcpMessage(message, client);
    if (reply) process.stdout.write(JSON.stringify(reply) + "\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStdio().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
