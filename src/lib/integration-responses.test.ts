import { describe, expect, it } from "vitest";
import { geminiAnswer, isFunctionFailure } from "./integration-responses";

describe("function response truthfulness", () => {
  it("does not treat HTTP 200 with success false as success", () => {
    expect(isFunctionFailure({ success: false, code: "PROVIDER_FAILED" })).toBe(true);
  });
  it("rejects error envelopes and ok false", () => {
    expect(isFunctionFailure({ error: "not_configured" })).toBe(true);
    expect(isFunctionFailure({ ok: false })).toBe(true);
  });
  it("allows successful and ordinary data payloads", () => {
    expect(isFunctionFailure({ success: true, mediaAssetId: "asset-123" })).toBe(false);
    expect(isFunctionFailure([{ id: "asset-123" }])).toBe(false);
  });
});

describe("Gemini answer parts", () => {
  it("joins answer parts without exposing thought parts", () => {
    expect(geminiAnswer({ candidates: [{ content: { parts: [
      { text: "internal", thought: true }, { text: "Hello " }, { text: "Coach" },
    ] } }] })).toBe("Hello Coach");
  });
  it("rejects empty and malformed responses", () => {
    expect(geminiAnswer({ candidates: [] })).toBe("");
    expect(geminiAnswer({ candidates: [{ content: { parts: [{ inlineData: {} }] } }] })).toBe("");
    expect(geminiAnswer(null)).toBe("");
  });
});