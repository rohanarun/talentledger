const state = { manifest: null, webKey: sessionStorage.getItem("product-web-key") ?? "" };
const byId = (id) => document.getElementById(id);

function show(value, kind = "neutral") {
  const panel = byId("output");
  panel.dataset.kind = kind;
  panel.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function api(path, options = {}, authenticated = true) {
  const headers = new Headers(options.headers ?? {});
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (authenticated) headers.set("X-Product-Web-Key", state.webKey);
  const response = await fetch(path, { ...options, headers });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed with HTTP " + response.status + ".");
  return body;
}

function actionOption(action) {
  const option = document.createElement("option");
  option.value = action.id;
  option.textContent = action.title + " [" + action.requiredScope + "]";
  return option;
}

function selectAction() {
  const action = state.manifest.actions.find((item) => item.id === byId("action").value);
  byId("action-description").textContent = action.description;
  byId("action-input").value = JSON.stringify(action.exampleInput ?? {}, null, 2);
}

function renderManifest(manifest) {
  state.manifest = manifest;
  document.title = manifest.product.name;
  byId("product-name").textContent = manifest.product.name;
  byId("tagline").textContent = manifest.product.tagline;
  byId("category").textContent = manifest.module.category;
  byId("plan").textContent = manifest.module.minimumHostedPlan;
  byId("action-count").textContent = String(manifest.actions.length);
  byId("module-id").textContent = manifest.module.id;
  byId("action").replaceChildren(...manifest.actions.map(actionOption));
  selectAction();
}

async function connect() {
  state.webKey = byId("web-key").value;
  sessionStorage.setItem("product-web-key", state.webKey);
  const workspace = await api("/product-api/workspace");
  byId("connection-state").textContent = "Connected";
  byId("connection-state").dataset.connected = "true";
  show(workspace, "success");
}

async function runAction() {
  let input;
  try { input = JSON.parse(byId("action-input").value); } catch { throw new Error("Action input must be valid JSON."); }
  show("Running action...");
  const result = await api("/product-api/actions/" + encodeURIComponent(byId("action").value), { method: "POST", body: JSON.stringify({ input }) });
  show(result, "success");
}

async function invoke(work) {
  try { await work(); } catch (error) { show(error instanceof Error ? error.message : String(error), "error"); }
}

byId("web-key").value = state.webKey;
byId("connect").addEventListener("click", () => invoke(connect));
byId("disconnect").addEventListener("click", () => {
  state.webKey = "";
  sessionStorage.removeItem("product-web-key");
  byId("web-key").value = "";
  byId("connection-state").textContent = "Disconnected";
  byId("connection-state").dataset.connected = "false";
  show("Local browser access cleared.");
});
byId("enable").addEventListener("click", () => invoke(async () => show(await api("/product-api/enable", { method: "POST" }), "success")));
byId("records").addEventListener("click", () => invoke(async () => show(await api("/product-api/records?limit=50"), "success")));
byId("workspace").addEventListener("click", () => invoke(async () => show(await api("/product-api/workspace"), "success")));
byId("action").addEventListener("change", selectAction);
byId("run-action").addEventListener("click", () => invoke(runAction));

invoke(async () => renderManifest(await api("/manifest", {}, false)));
