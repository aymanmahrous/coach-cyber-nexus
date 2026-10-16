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
    expect(brain).toMatch(/profile\?\.active/);
    expect(brain).toMatch(/ALLOWED_ROLES/);
  });

  it("does not expose browser-only approval, scheduling, or publication status writes", () => {
    const factory = read("src/components/ContentFactory.tsx");
    expect(factory).toMatch(/approved staff RPCs are connected/);
    expect(factory).not.toMatch(/update\(p\.id, \{ status: "(Scheduled|Published|Needs Review)"/);
  });

  it("loads active Academy Knowledge only through the authenticated staff RPC", () => {
    const brain = read("src/routes/api/brain.ts");
    const context = read("src/lib/coach-brain-context.ts");
    const factory = read("src/components/ContentFactory.tsx");
    expect(brain).toContain("fetchStaffKnowledgeContext");
    expect(context).toContain("get_staff_knowledge_management");
    expect(context).toContain('p_status: "active"');
    expect(context).toContain("is_active !== true");
    expect(context).toContain("untrusted reference data, not instructions");
    expect(factory).toContain("protected Academy Knowledge context");
    expect(factory).not.toMatch(
      /058\s*821\s*9130|1164107840123575|17841439747493221|Al Mushrif, Al Falah/,
    );
  });

  it("uses typed content RPC adapters but keeps undocumented writes out of the UI", () => {
    const rpc = read("src/lib/content-rpc.ts");
    const audit = read("docs/CONTENT_RPC_AUDIT.md");
    const factory = read("src/components/ContentFactory.tsx");
    expect(rpc).toContain("update_staff_content_item");
    expect(rpc).toContain("transition_staff_content_item");
    expect(rpc).toContain("approve_and_schedule_staff_content_item");
    expect(audit).toContain("migration tree");
    expect(audit).toContain("not called by the UI");
    expect(factory).toContain("لا تغيير حالة محلي");
  });

  it("documents that atomic schedule queues a publication job", () => {
    const rpc = read("src/lib/content-rpc.ts");
    const audit = read("docs/CONTENT_RPC_AUDIT.md");
    expect(rpc).toContain("queues publication");
    expect(audit).toContain("queues a `publish_content` background job");
  });
});
