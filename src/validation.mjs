export class InputValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputValidationError";
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(path, message) {
  throw new InputValidationError(path + " " + message);
}

function formatIsValid(format, value) {
  if (typeof format !== "string") return true;
  if (format === "uuid") return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (format === "date-time") return !Number.isNaN(Date.parse(value)) && /T/.test(value);
  if (format === "email") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  if (format === "uri") {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }
  return true;
}

export function validateInput(schema, value, path = "input") {
  if (!schema || typeof schema !== "object") return value;
  if (Array.isArray(schema.anyOf)) {
    const errors = [];
    for (const branch of schema.anyOf) {
      try {
        return validateInput(branch, value, path);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    fail(path, "does not match any permitted shape: " + errors.join("; "));
  }
  if (schema.const !== undefined && value !== schema.const) fail(path, "must equal " + JSON.stringify(schema.const) + ".");
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) fail(path, "must be one of " + schema.enum.map(JSON.stringify).join(", ") + ".");

  switch (schema.type) {
    case "null":
      if (value !== null) fail(path, "must be null.");
      break;
    case "object": {
      if (!isPlainObject(value)) fail(path, "must be an object.");
      for (const key of schema.required ?? []) {
        if (!(key in value)) fail(path + "." + key, "is required.");
      }
      if (schema.additionalProperties === false) {
        const allowed = new Set(Object.keys(schema.properties ?? {}));
        for (const key of Object.keys(value)) if (!allowed.has(key)) fail(path + "." + key, "is not permitted.");
      }
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (key in value) validateInput(child, value[key], path + "." + key);
      }
      break;
    }
    case "array":
      if (!Array.isArray(value)) fail(path, "must be an array.");
      if (schema.minItems !== undefined && value.length < schema.minItems) fail(path, "must contain at least " + schema.minItems + " item(s).");
      if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(path, "must contain at most " + schema.maxItems + " item(s).");
      if (schema.items) value.forEach((item, index) => validateInput(schema.items, item, path + "[" + index + "]"));
      break;
    case "string":
      if (typeof value !== "string") fail(path, "must be a string.");
      if (schema.minLength !== undefined && value.length < schema.minLength) fail(path, "must contain at least " + schema.minLength + " character(s).");
      if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(path, "must contain at most " + schema.maxLength + " character(s).");
      if (typeof schema.pattern === "string" && !(new RegExp(schema.pattern)).test(value)) fail(path, "does not match the required pattern.");
      if (!formatIsValid(schema.format, value)) fail(path, "must use the " + schema.format + " format.");
      break;
    case "integer":
      if (!Number.isInteger(value)) fail(path, "must be an integer.");
      if (schema.minimum !== undefined && value < schema.minimum) fail(path, "must be at least " + schema.minimum + ".");
      if (schema.maximum !== undefined && value > schema.maximum) fail(path, "must be at most " + schema.maximum + ".");
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "must be a finite number.");
      if (schema.minimum !== undefined && value < schema.minimum) fail(path, "must be at least " + schema.minimum + ".");
      if (schema.maximum !== undefined && value > schema.maximum) fail(path, "must be at most " + schema.maximum + ".");
      break;
    case "boolean":
      if (typeof value !== "boolean") fail(path, "must be a boolean.");
      break;
    default:
      break;
  }
  return value;
}
