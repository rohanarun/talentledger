#!/usr/bin/env node
import { actionById, actions, manifest } from "./manifest.mjs";
import { clientFromEnvironment } from "./client.mjs";

function usage() {
  const command = manifest.product.command;
  const prefix = manifest.product.environmentPrefix;
  return manifest.product.name + " CLI\n\n" +
    "Usage:\n" +
    "  " + command + " version\n" +
    "  " + command + " manifest\n" +
    "  " + command + " actions\n" +
    "  " + command + " action-help <action>\n" +
    "  " + command + " workspace\n" +
    "  " + command + " enable\n" +
    "  " + command + " list [record-type] [limit]\n" +
    "  " + command + " page [json-options]\n" +
    "  " + command + " detail <record-id>\n" +
    "  " + command + " ai-status <action-id>\n" +
    "  " + command + " action <action> <json-input>\n\n" +
    "Environment:\n" +
    "  " + prefix + "_TOKEN or SUPERSUITE_TOKEN  Scoped workspace API token\n" +
    "  " + prefix + "_URL or SUPERSUITE_URL      API origin";
}

function output(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function parseObject(value) {
  if (!value) throw new Error("json-input is required.");
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error("json-input must be valid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("json-input must be a JSON object.");
  return parsed;
}

function parsePageOptions(value) {
  return value ? parseObject(value) : {};
}

async function run(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") return process.stdout.write(usage() + "\n");
  if (command === "version" || command === "--version" || command === "-v") return process.stdout.write(manifest.release.productVersion + "\n");
  if (command === "manifest") return output(manifest);
  if (command === "actions") return output(actions);
  if (command === "action-help") {
    const action = actionById.get(args[0]);
    if (!action) throw new Error("Choose an action: " + actions.map((item) => item.id).join(", ") + ".");
    return output(action);
  }

  const client = clientFromEnvironment();
  if (command === "workspace") return output(await client.workspace());
  if (command === "enable") return output(await client.enable());
  if (command === "list") return output(await client.listRecords({ recordType: args[0], limit: args[1] ? Number(args[1]) : 50 }));
  if (command === "page") return output(await client.listRecords(parsePageOptions(args[0])));
  if (command === "detail") return output(await client.recordDetail(args[0]));
  if (command === "ai-status") return output(await client.aiStatus(args[0]));
  if (command === "action") {
    if (!args[0]) throw new Error("Choose an action: " + actions.map((item) => item.id).join(", ") + ".");
    return output(await client.runAction(args[0], parseObject(args[1])));
  }
  throw new Error("Unknown command: " + command + ".\n\n" + usage());
}

run().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
