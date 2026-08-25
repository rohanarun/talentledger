const state = {
  manifest: null,
  webKey: sessionStorage.getItem("product-web-key") ?? "",
  workspace: null,
  records: [],
  activities: [],
  connected: false,
  demo: false,
  activeView: "overview",
  selectedAction: null,
  recordQuery: "",
  recordType: "all",
  recordState: "",
  nextCursor: null,
  recordLoading: false,
  recordRequestId: 0,
};

let recordRefreshTimer;

const byId = (id) => document.getElementById(id);
const queryAll = (selector, root = document) => [...root.querySelectorAll(selector)];

function humanize(value) {
  return String(value ?? "").replaceAll(/[-_]+/g, " ").replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date) : "Not dated";
}

function dateTimeLocalValue(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60_000)).toISOString().slice(0, 16);
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function clear(element) {
  element.replaceChildren();
  return element;
}

function toast(message, kind = "neutral") {
  const item = make("div", "toast", message);
  item.dataset.kind = kind;
  byId("toast-root").append(item);
  requestAnimationFrame(() => item.dataset.visible = "true");
  setTimeout(() => {
    item.dataset.visible = "false";
    setTimeout(() => item.remove(), 220);
  }, 4200);
}

function setBusy(isBusy, label = "Working") {
  document.body.dataset.busy = String(isBusy);
  byId("busy-label").textContent = label;
}

async function api(path, options = {}, authenticated = true) {
  const headers = new Headers(options.headers ?? {});
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (authenticated) headers.set("X-Product-Web-Key", state.webKey);
  const response = await fetch(path, { ...options, headers });
  let body;
  try { body = await response.json(); } catch { body = { error: "The server returned a non-JSON response." }; }
  if (!response.ok) throw new Error(body.error ?? "Request failed with HTTP " + response.status + ".");
  return body;
}

function workspaceValue() {
  return state.workspace?.workspace ?? state.workspace ?? {};
}

function setConnection(connected) {
  state.connected = connected;
  const status = byId("connection-state");
  status.textContent = connected ? state.demo ? "Sample workspace" : "Connected" : "Connect";
  status.dataset.connected = String(connected);
  byId("connect-trigger").textContent = connected ? state.demo ? "Sample workspace" : "Workspace connected" : "Connect workspace";
  byId("sample-banner").hidden = !state.demo;
}

function activateView(view) {
  state.activeView = view;
  queryAll("[data-view]").forEach((button) => {
    const selected = button.dataset.view === view;
    button.dataset.active = String(selected);
    button.setAttribute("aria-current", selected ? "page" : "false");
  });
  queryAll(".view").forEach((section) => { section.hidden = section.id !== "view-" + view; });
  byId("current-view").textContent = humanize(view);
  if (view === "records") renderRecords();
  if (view === "workflows") renderWorkflows();
  if (view === "ai") renderAi();
  if (view === "settings") renderSettings();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function actionButton(action, className = "action-row") {
  const button = make("button", className);
  button.type = "button";
  button.dataset.actionId = action.id;
  const copy = make("span", "action-copy");
  copy.append(make("strong", "", action.title), make("small", "", action.description));
  const scope = make("span", "scope", action.requiredScope);
  button.append(copy, scope);
  button.addEventListener("click", () => openAction(action.id));
  return button;
}

function renderManifest(manifest) {
  state.manifest = manifest;
  document.title = manifest.product.name + " — Workspace";
  byId("product-name").textContent = manifest.product.name;
  byId("product-category").textContent = manifest.module.category;
  byId("hero-title").textContent = manifest.experience.headline;
  byId("hero-description").textContent = manifest.module.description;
  byId("module-plan").textContent = humanize(manifest.module.minimumHostedPlan) + " plan";
  document.body.style.setProperty("--accent", manifest.product.accent);
  document.body.style.setProperty("--accent-dark", manifest.product.accentDark);

  const quickActions = clear(byId("quick-actions"));
  for (const actionId of manifest.experience.quickActionIds ?? []) {
    const action = manifest.actions.find((candidate) => candidate.id === actionId);
    if (action) quickActions.append(actionButton(action, "quick-action"));
  }
  const primary = manifest.actions.find((action) => action.id === manifest.experience.primaryActionId) ?? manifest.actions[0];
  byId("primary-action-label").textContent = primary.title;
  byId("primary-action").onclick = () => openAction(primary.id);

  const filters = clear(byId("record-type-filter"));
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All record types";
  filters.append(all);
  for (const recordType of manifest.module.recordTypes) {
    const option = document.createElement("option");
    option.value = recordType;
    option.textContent = humanize(recordType);
    filters.append(option);
  }
  renderMetrics();
  renderWorkflows();
  renderAi();
  renderSettings();
}

function renderMetrics() {
  if (!state.manifest) return;
  const metrics = clear(byId("metric-grid"));
  const liveValues = new Map([
    ["Typed actions", state.manifest.actions.length],
    ["Record types", new Set(state.records.map((record) => record.recordType)).size || state.manifest.module.recordTypes.length],
    ["Workspace records", state.records.length],
    ["Review gates", state.manifest.experience.metrics.find((metric) => metric.label === "Review gates")?.value ?? 0],
  ]);
  for (const [label, value] of liveValues) {
    const card = make("article", "metric-card");
    card.append(make("span", "metric-value", String(value).padStart(2, "0")), make("span", "metric-label", label));
    metrics.append(card);
  }
}

function recordCard(record, compact = false) {
  const card = make("button", compact ? "record-card compact" : "record-card");
  card.type = "button";
  const top = make("span", "record-card-top");
  top.append(make("span", "record-type", humanize(record.recordType)), make("span", "record-state", humanize(record.state || "current")));
  card.append(top, make("strong", "record-title", record.title || humanize(record.recordType)), make("span", "record-date", "Updated " + shortDate(record.updatedAt)));
  card.addEventListener("click", () => invoke(() => openRecord(record.id)));
  return card;
}

function renderRecentRecords() {
  const target = clear(byId("recent-records"));
  const records = state.records.slice(0, 5);
  if (!records.length) {
    target.append(make("p", "empty-state", state.connected ? "No records yet. Run the primary workflow to create the first one." : "Connect a workspace to load current records."));
    return;
  }
  records.forEach((record) => target.append(recordCard(record, true)));
}

function renderRecords() {
  const records = state.records;
  byId("record-count").textContent = records.length + (records.length === 1 ? " record loaded" : " records loaded");
  const loadMore = byId("load-more-records");
  loadMore.hidden = !state.connected || !state.nextCursor;
  loadMore.disabled = state.recordLoading;
  loadMore.textContent = state.recordLoading ? "Loading records" : "Load more records";
  const grid = clear(byId("record-grid"));
  if (!records.length) {
    grid.append(make("p", "empty-state wide", state.connected ? state.recordLoading ? "Loading records." : "No records match this view." : "Connect a workspace to inspect records."));
    return;
  }
  records.forEach((record) => grid.append(recordCard(record)));
}

function renderWorkflows() {
  if (!state.manifest) return;
  const target = clear(byId("workflow-groups"));
  for (const [index, group] of state.manifest.experience.workflowGroups.entries()) {
    const section = make("section", "workflow-group");
    const trigger = make("button", "workflow-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", String(index === 0));
    trigger.append(make("span", "workflow-index", String(index + 1).padStart(2, "0")), make("strong", "", group.name), make("span", "workflow-count", group.actionIds.length + " workflows"));
    const body = make("div", "workflow-body");
    body.hidden = index !== 0;
    for (const actionId of group.actionIds) {
      const action = state.manifest.actions.find((candidate) => candidate.id === actionId);
      if (action) body.append(actionButton(action));
    }
    trigger.addEventListener("click", () => {
      const expanded = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", String(!expanded));
      body.hidden = expanded;
    });
    section.append(trigger, body);
    target.append(section);
  }
}

function renderAi() {
  if (!state.manifest) return;
  const target = clear(byId("ai-actions"));
  const actions = state.manifest.actions.filter((action) => action.requiredScope === "ai" || action.operation === "ai");
  if (!actions.length) {
    target.append(make("p", "empty-state wide", "This product keeps every declared workflow deterministic and does not expose an AI action."));
    return;
  }
  actions.forEach((action) => target.append(actionButton(action, "ai-card")));
}

function renderSettings() {
  if (!state.manifest) return;
  byId("settings-boundary").textContent = state.manifest.experience.releaseBoundary;
  byId("settings-module").textContent = state.manifest.module.id;
  byId("settings-plan").textContent = state.manifest.module.minimumHostedPlan;
  byId("settings-resource").textContent = state.manifest.module.resourceClass;
  byId("settings-version").textContent = state.manifest.release.productVersion;
  const capabilities = clear(byId("capability-list"));
  state.manifest.module.aiCapabilities.forEach((capability) => capabilities.append(make("li", "", capability)));
}

async function openRecord(recordId) {
  setBusy(true, "Loading record detail");
  let response;
  try {
    response = await api("/product-api/records/" + encodeURIComponent(recordId));
  } finally {
    setBusy(false);
  }
  const record = response.record ?? response;
  byId("record-detail-title").textContent = record.title || humanize(record.recordType);
  byId("record-detail-meta").textContent = humanize(record.recordType) + " · " + humanize(record.state || "current") + " · Updated " + shortDate(record.updatedAt);
  byId("record-detail-json").textContent = JSON.stringify(record, null, 2);
  byId("record-dialog").showModal();
}

function fieldDescription(schema) {
  return schema.description || (schema.format ? "Required format: " + schema.format + "." : "Typed input enforced by the product action contract.");
}

function runtimeExampleInput(action) {
  const example = structuredClone(action.exampleInput ?? {});
  const currentUserId = workspaceValue().userId;
  if (!currentUserId) return example;
  for (const name of ["employeeRef", "managerRef", "ownerRef"]) {
    if (Object.hasOwn(action.inputSchema.properties ?? {}, name) && typeof example[name] === "string") example[name] = currentUserId;
  }
  return example;
}

function createField(name, schema, value, required) {
  const group = make("div", "field-group");
  const label = make("label", "field-label");
  label.htmlFor = "field-" + name;
  label.append(document.createTextNode(humanize(name)));
  if (required) label.append(make("span", "required", "Required"));
  let control;
  if (Array.isArray(schema.enum)) {
    control = document.createElement("select");
    for (const optionValue of schema.enum) {
      const option = document.createElement("option");
      option.value = String(optionValue);
      option.textContent = humanize(optionValue);
      option.selected = optionValue === value;
      control.append(option);
    }
  } else if (schema.type === "boolean") {
    const wrapper = make("label", "toggle");
    control = document.createElement("input");
    control.type = "checkbox";
    control.checked = value === true;
    wrapper.append(control, make("span", "toggle-track"), make("span", "toggle-copy", "Enabled"));
    label.htmlFor = "";
    group.append(label, wrapper, make("p", "field-help", fieldDescription(schema)));
  } else if (schema.type === "array" || schema.type === "object" || (schema.type === "string" && (schema.maxLength ?? 0) > 320)) {
    control = document.createElement("textarea");
    control.rows = schema.type === "string" ? 4 : 5;
    control.value = schema.type === "string" ? value ?? "" : JSON.stringify(value ?? (schema.type === "array" ? [] : {}), null, 2);
    control.dataset.json = schema.type === "string" ? "false" : "true";
  } else {
    control = document.createElement("input");
    control.type = schema.type === "integer" || schema.type === "number" ? "number" : schema.format === "email" ? "email" : schema.format === "date-time" ? "datetime-local" : schema.format === "uri" ? "url" : "text";
    if (schema.minimum !== undefined) control.min = String(schema.minimum);
    if (schema.maximum !== undefined) control.max = String(schema.maximum);
    if (schema.maxLength !== undefined) control.maxLength = schema.maxLength;
    if (value !== undefined && value !== null) control.value = schema.format === "date-time" ? dateTimeLocalValue(value) : String(value);
    if (schema.format === "uuid" || /Id$/.test(name)) {
      control.setAttribute("list", "record-identifiers");
      control.placeholder = "Select or paste a record ID";
    }
  }
  control.id = "field-" + name;
  control.name = name;
  control.dataset.schemaType = schema.type ?? "string";
  control.required = required;
  if (schema.type !== "boolean") group.append(label, control, make("p", "field-help", fieldDescription(schema)));
  return group;
}

function buildActionForm(action) {
  const form = clear(byId("action-form"));
  const required = new Set(action.inputSchema.required ?? []);
  const example = runtimeExampleInput(action);
  for (const [name, schema] of Object.entries(action.inputSchema.properties ?? {})) form.append(createField(name, schema, example[name], required.has(name)));
  byId("action-json").value = JSON.stringify(example, null, 2);
  form.addEventListener("input", () => {
    try { byId("action-json").value = JSON.stringify(collectActionInput(action), null, 2); } catch { }
  });
}

function collectActionInput(action) {
  if (byId("advanced-input").open) {
    let parsed;
    try { parsed = JSON.parse(byId("action-json").value); } catch { throw new Error("Advanced JSON input must be valid JSON."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Advanced JSON input must be an object.");
    return parsed;
  }
  const input = {};
  const required = new Set(action.inputSchema.required ?? []);
  for (const [name, schema] of Object.entries(action.inputSchema.properties ?? {})) {
    const control = byId("field-" + name);
    if (!control) continue;
    if (schema.type === "boolean") {
      input[name] = control.checked;
      continue;
    }
    if (!control.value && !required.has(name)) continue;
    if (control.dataset.json === "true") {
      try { input[name] = JSON.parse(control.value); } catch { throw new Error(humanize(name) + " must contain valid JSON."); }
    } else if (schema.type === "integer" || schema.type === "number") input[name] = Number(control.value);
    else if (schema.format === "date-time" && control.value) input[name] = new Date(control.value).toISOString();
    else input[name] = control.value;
  }
  return input;
}

function openAction(actionId) {
  const action = state.manifest.actions.find((candidate) => candidate.id === actionId);
  if (!action) return;
  if (!state.connected) {
    byId("connect-dialog").showModal();
    toast("Connect the product server before opening a workflow.", "error");
    return;
  }
  state.selectedAction = action;
  byId("action-dialog-title").textContent = action.title;
  byId("action-dialog-description").textContent = action.description;
  byId("action-scope").textContent = action.requiredScope + " scope";
  byId("action-operation").textContent = humanize(action.operation);
  byId("advanced-input").open = false;
  byId("action-result").hidden = true;
  buildActionForm(action);
  byId("action-dialog").showModal();
}

function addActivity(action, result) {
  state.activities.unshift({ actionId: action.id, title: action.title, status: result.kind === "ai-action" ? "proposal ready" : "completed", at: new Date().toISOString() });
  state.activities = state.activities.slice(0, 12);
  renderActivity();
}

function renderActivity() {
  const target = clear(byId("activity-list"));
  const items = state.activities.length ? state.activities : (state.records.slice(0, 4).map((record) => ({ title: "Updated " + humanize(record.recordType), status: record.state || "current", at: record.updatedAt })));
  if (!items.length) return target.append(make("p", "empty-state", "Recent workflow activity will appear here."));
  for (const item of items) {
    const row = make("div", "activity-row");
    row.append(make("span", "activity-dot"), make("strong", "", item.title), make("span", "activity-status", humanize(item.status)), make("time", "", shortDate(item.at)));
    target.append(row);
  }
}

function recordPagePath(cursor) {
  const query = new URLSearchParams({ limit: "50" });
  if (state.recordType !== "all") query.set("recordType", state.recordType);
  if (state.recordState.trim()) query.set("state", state.recordState.trim());
  if (state.recordQuery.trim()) query.set("search", state.recordQuery.trim());
  if (cursor) query.set("cursor", cursor);
  return "/product-api/records?" + query.toString();
}

function renderRecordCollections() {
  renderMetrics();
  renderRecentRecords();
  renderRecords();
  renderActivity();
  const identifiers = clear(byId("record-identifiers"));
  state.records.forEach((record) => {
    const option = document.createElement("option");
    option.value = record.id;
    option.label = (record.title || humanize(record.recordType)) + " — " + humanize(record.recordType);
    identifiers.append(option);
  });
}

async function refreshRecords({ append = false } = {}) {
  if (!state.connected) return;
  const cursor = append ? state.nextCursor : undefined;
  if (append && !cursor) return;
  const requestId = ++state.recordRequestId;
  state.recordLoading = true;
  if (!append) state.nextCursor = null;
  renderRecords();
  try {
    const response = await api(recordPagePath(cursor));
    if (requestId !== state.recordRequestId) return;
    const page = Array.isArray(response.records) ? response.records : [];
    if (append) {
      const existingIds = new Set(state.records.map((record) => record.id));
      state.records = [...state.records, ...page.filter((record) => !existingIds.has(record.id))];
    } else state.records = page;
    state.nextCursor = typeof response.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
    renderRecordCollections();
  } finally {
    if (requestId === state.recordRequestId) {
      state.recordLoading = false;
      renderRecords();
    }
  }
}

function scheduleRecordRefresh() {
  clearTimeout(recordRefreshTimer);
  recordRefreshTimer = setTimeout(() => invoke(() => refreshRecords()), 260);
}

async function connect() {
  const key = byId("web-key").value.trim();
  if (key.length < 24) throw new Error("Enter the separate browser access key configured for this product server.");
  state.webKey = key;
  sessionStorage.setItem("product-web-key", key);
  state.workspace = await api("/product-api/workspace");
  state.demo = state.workspace.demo === true;
  setConnection(true);
  byId("connect-dialog").close();
  await refreshRecords();
  const workspace = workspaceValue();
  byId("workspace-name").textContent = workspace.name || workspace.slug || "Private workspace";
  toast(state.demo ? "Sample workspace loaded." : "Workspace connected.", "success");
}

async function executeSelectedAction(event) {
  event.preventDefault();
  if (!state.connected) {
    byId("connect-dialog").showModal();
    toast("Connect the product server before running a workflow.", "error");
    return;
  }
  const action = state.selectedAction;
  const input = collectActionInput(action);
  setBusy(true, "Running " + action.title);
  try {
    const result = await api("/product-api/actions/" + encodeURIComponent(action.id), { method: "POST", body: JSON.stringify({ input }) });
    addActivity(action, result);
    byId("action-result").hidden = false;
    byId("action-result-json").textContent = JSON.stringify(result, null, 2);
    await refreshRecords();
    toast(action.title + " completed.", "success");
  } finally {
    setBusy(false);
  }
}

async function invoke(work) {
  try { await work(); }
  catch (error) {
    toast(error instanceof Error ? error.message : String(error), "error");
    setBusy(false);
  }
}

queryAll("[data-view]").forEach((button) => button.addEventListener("click", () => activateView(button.dataset.view)));
byId("connect-trigger").addEventListener("click", () => byId("connect-dialog").showModal());
byId("connect-cancel").addEventListener("click", () => byId("connect-dialog").close());
byId("connect").addEventListener("click", () => invoke(connect));
byId("disconnect").addEventListener("click", () => {
  state.webKey = "";
  state.workspace = null;
  state.records = [];
  state.demo = false;
  state.nextCursor = null;
  state.recordLoading = false;
  state.recordRequestId += 1;
  sessionStorage.removeItem("product-web-key");
  byId("web-key").value = "";
  setConnection(false);
  renderMetrics();
  renderRecentRecords();
  renderRecords();
  byId("connect-dialog").close();
  toast("Browser access cleared.");
});
byId("enable-product").addEventListener("click", () => invoke(async () => {
  if (!state.connected) return byId("connect-dialog").showModal();
  await api("/product-api/enable", { method: "POST" });
  state.workspace = await api("/product-api/workspace");
  toast("Product enabled for this workspace.", "success");
}));
byId("refresh-records").addEventListener("click", () => invoke(() => refreshRecords()));
byId("view-all-records").addEventListener("click", () => activateView("records"));
byId("record-query").addEventListener("input", (event) => { state.recordQuery = event.target.value; scheduleRecordRefresh(); });
byId("record-type-filter").addEventListener("change", (event) => { state.recordType = event.target.value; invoke(() => refreshRecords()); });
byId("record-state-filter").addEventListener("input", (event) => { state.recordState = event.target.value; scheduleRecordRefresh(); });
byId("load-more-records").addEventListener("click", () => invoke(() => refreshRecords({ append: true })));
byId("action-execute").addEventListener("click", executeSelectedAction);
byId("action-close").addEventListener("click", () => byId("action-dialog").close());
byId("record-close").addEventListener("click", () => byId("record-dialog").close());
byId("global-search").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  state.recordQuery = event.currentTarget.value;
  byId("record-query").value = state.recordQuery;
  activateView("records");
  invoke(() => refreshRecords());
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    byId("global-search").focus();
  }
});

invoke(async () => {
  const manifest = await api("/manifest", {}, false);
  renderManifest(manifest);
  byId("web-key").value = state.webKey;
  setConnection(false);
  renderRecentRecords();
  renderRecords();
  renderActivity();
  activateView("overview");
  if (state.webKey.length >= 24) await connect();
});
