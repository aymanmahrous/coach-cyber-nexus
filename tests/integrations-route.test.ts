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

  it("does not claim Canva is connected when durable authorization is not inspected", () => {
    const list = evaluateIntegrations();
    const canva = list.find((i) => i.id === "canva");
    expect(canva?.status).toBe("configured_unverified");
    expect(canva?.notesEn).toContain("no connection is claimed");
  });

  it("never treats an AI key as proof that the provider is operational", () => {
    const previous = process.env["GEMINI_API_KEY"];
    process.env["GEMINI_API_KEY"] = "test-key-presence-only";
    try {
      const ai = evaluateIntegrations().find((item) => item.id === "coach_brain");
      expect(ai?.status).toBe("configured_unverified");
      expect(ai?.notesEn).toContain("does not test connectivity");
    } finally {
      if (previous === undefined) delete process.env["GEMINI_API_KEY"];
      else process.env["GEMINI_API_KEY"] = previous;
    }
  });

  it("marks only the request-verified auth/database check as verified", () => {
    const backend = evaluateIntegrations({ staffBackendVerified: true }).find(
      (item) => item.id === "supabase",
    );
    expect(backend?.status).toBe("verified");
    expect(backend?.notesEn).toContain("Storage was not tested");
  });

  it("does not leak secret tokens or credentials in the output", () => {
    const list = evaluateIntegrations();
    const serialized = JSON.stringify(list);
    expect(serialized).not.toMatch(/Bearer|eyJ|sk_[A-Za-z0-9]/);
    expect(serialized).not.toMatch(
      /test-key-presence-only|Bearer\s|eyJ[A-Za-z0-9_-]{20,}|sk_[A-Za-z0-9]/i,
    );
  });
});
