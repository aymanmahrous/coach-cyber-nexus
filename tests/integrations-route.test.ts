import { describe, expect, it } from "vitest";
import { evaluateIntegrations } from "../src/routes/api/integrations";

describe("Honest Integrations Evaluation API", () => {
  it("evaluates integration statuses cleanly into official 5 categories", () => {
    const list = evaluateIntegrations();
    expect(list.length).toBeGreaterThanOrEqual(5);

    const validStatuses = new Set([
      "not_configured",
      "setup_saved",
      "configured_unverified",
      "verified",
      "blocked",
    ]);

    for (const item of list) {
      expect(validStatuses.has(item.status)).toBe(true);
      expect(item.id).toBeDefined();
      expect(item.labelAr).toBeDefined();
      expect(item.labelEn).toBeDefined();
      expect(item.notesAr).toBeDefined();
      expect(item.notesEn).toBeDefined();
      // No live external publishing allowed in preview
      expect(item.canPublishLive).toBe(false);
    }
  });

  it("marks Canva as not_configured (retired in-memory route)", () => {
    const list = evaluateIntegrations();
    const canva = list.find((i) => i.id === "canva");
    expect(canva?.status).toBe("not_configured");
  });

  it("does not leak secret tokens or credentials in the output", () => {
    const list = evaluateIntegrations();
    const serialized = JSON.stringify(list);
    expect(serialized).not.toMatch(/Bearer|eyJ|sk_[A-Za-z0-9]/);
    expect(serialized).not.toMatch(/token|secret|password|key/i);
  });
});
