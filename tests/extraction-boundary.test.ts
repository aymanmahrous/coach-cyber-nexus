import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("official product extraction boundary", () => {
  it("does not ship the legacy live-publish or in-memory Canva routes", () => {
    expect(existsSync(new URL("../src/routes/api/publish.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../src/routes/api/canva.ts", import.meta.url))).toBe(false);
    expect(read("src/routeTree.gen.ts")).not.toMatch(/api\/(publish|canva)/);
  });

  it("does not call legacy publication routes or keep owner PIN credentials in the app", () => {
    const factory = read("src/components/ContentFactory.tsx");
    const env = read(".env.example");
    expect(factory).not.toMatch(
      /\/api\/publish|owner-pin|handleMetaPublish|handleLaunchPublishBridge/,
    );
    expect(env).not.toMatch(/OWNER_PUBLISH_PIN|FACEBOOK_PAGE_ACCESS_TOKEN|INSTAGRAM_ACCESS_TOKEN/);
  });

  it("uses an authenticated, active staff profile for the shared session gate", () => {
    const auth = read("src/lib/official-auth.ts");
    const brain = read("src/routes/api/brain.ts");
    expect(auth).toMatch(/auth\/v1\/user/);
    expect(auth).toMatch(/active: z\.boolean\(\)/);
    expect(auth).toMatch(/if \(!profile \|\| !profile\.active\)/);
    expect(brain).toMatch(/Bearer\\s\+/);
    expect(brain).toMatch(/active !== true/);
  });

  it("does not expose browser-only approval, scheduling, or publication status writes", () => {
    const factory = read("src/components/ContentFactory.tsx");
    expect(factory).toMatch(/approved staff RPCs are connected/);
    expect(factory).not.toMatch(/update\(p\.id, \{ status: "(Scheduled|Published|Needs Review)"/);
  });
});
