import { describe, expect, it } from "vitest";
import { canvaStatus, isSafeImageUrl } from "./integration-guards";

describe("isSafeImageUrl", () => {
  it("accepts a public https URL", () => {
    expect(isSafeImageUrl("https://images.example.com/a.jpg")).toBe(true);
  });
  it("rejects http", () => {
    expect(isSafeImageUrl("http://images.example.com/a.jpg")).toBe(false);
  });
  it("rejects localhost and IP literals", () => {
    expect(isSafeImageUrl("https://localhost/a.jpg")).toBe(false);
    expect(isSafeImageUrl("https://127.0.0.1/a.jpg")).toBe(false);
    expect(isSafeImageUrl("https://[::1]/a.jpg")).toBe(false);
  });
  it("rejects embedded credentials", () => {
    expect(isSafeImageUrl("https://u:p@example.com/a.jpg")).toBe(false);
  });
});

describe("canvaStatus", () => {
  it("is needs_setup without client credentials", () => {
    expect(canvaStatus({ configured: false, connectedThisInstance: false })).toBe("needs_setup");
  });
  it("is configured_unverified before any OAuth", () => {
    expect(canvaStatus({ configured: true, connectedThisInstance: false })).toBe(
      "configured_unverified",
    );
  });
  it("is limited (never verified) with an in-memory token", () => {
    expect(canvaStatus({ configured: true, connectedThisInstance: true })).toBe("limited");
  });
  it("is blocked when the status response is unusable", () => {
    expect(canvaStatus(null)).toBe("blocked");
  });
});
