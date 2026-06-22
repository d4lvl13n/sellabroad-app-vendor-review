import crypto from "node:crypto";

export type JsonObject = Record<string, unknown>;

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export const sanitizeForLog = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      const normalized = key.toLowerCase();

      if (
        normalized.includes("password") ||
        normalized.includes("secret") ||
        normalized.includes("token") ||
        normalized.includes("authorization") ||
        normalized.includes("api_key") ||
        normalized.includes("apikey")
      ) {
        return [key, "[REDACTED]"];
      }

      return [key, sanitizeForLog(entry)];
    })
  );
};
