#!/usr/bin/env node
import { startWebServer } from "./web-server.mjs";

const env = {
  ...process.env,
  PRODUCT_DEMO_MODE: "true",
  PRODUCT_WEB_KEY: process.env.PRODUCT_WEB_KEY ?? "sample-workspace-key-2026",
};

startWebServer(env).catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
