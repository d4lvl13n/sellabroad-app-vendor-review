import { describe, it, expect } from "vitest";
import { signPayload, verifySignature } from "../sellabroad-hmac";

describe("signPayload", () => {
  it("produces sha256= prefixed HMAC-SHA256 hex digest", () => {
    const result = signPayload('{"test":true}', "secret123");

    expect(result).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("produces deterministic output for same input", () => {
    const a = signPayload("hello", "key");
    const b = signPayload("hello", "key");

    expect(a).toBe(b);
  });

  it("produces different output for different bodies", () => {
    const a = signPayload("body-a", "key");
    const b = signPayload("body-b", "key");

    expect(a).not.toBe(b);
  });

  it("produces different output for different secrets", () => {
    const a = signPayload("body", "key-a");
    const b = signPayload("body", "key-b");

    expect(a).not.toBe(b);
  });
});

describe("verifySignature", () => {
  it("returns true for valid signature", () => {
    const body = '{"order_id":"123"}';
    const secret = "test-secret";
    const signature = signPayload(body, secret);

    expect(verifySignature(body, signature, secret)).toBe(true);
  });

  it("returns false for tampered body", () => {
    const secret = "test-secret";
    const signature = signPayload('{"order_id":"123"}', secret);

    expect(verifySignature('{"order_id":"456"}', signature, secret)).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const body = '{"order_id":"123"}';
    const signature = signPayload(body, "correct-secret");

    expect(verifySignature(body, signature, "wrong-secret")).toBe(false);
  });

  it("returns false for malformed signature", () => {
    expect(verifySignature("body", "not-a-valid-sig", "secret")).toBe(false);
  });
});
