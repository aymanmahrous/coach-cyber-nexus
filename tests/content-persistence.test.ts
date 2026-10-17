import { describe, expect, it, beforeEach } from "vitest";
import { loadStoredPosts, persistStoredPosts, mapContentItem, type Post } from "../src/lib/posts";

// Mock localStorage in test environment
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

describe("Content persistence and reload resilience", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("persists posts to durable storage and restores them upon reload", () => {
    const userId = "staff-user-123";
    const samplePosts: Post[] = [
      {
        id: "123e4567-e89b-42d3-a456-426614174000",
        platform: "instagram",
        caption: "Breathing technique for freestyle swimmers in Abu Dhabi",
        visual: "Cyan and navy visual prompt",
        status: "Needs Review",
        createdAt: "2026-10-16T12:00:00Z",
      },
    ];

    persistStoredPosts(userId, samplePosts);

    // Simulate page reload
    const restored = loadStoredPosts(userId);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(restored[0]?.caption).toBe("Breathing technique for freestyle swimmers in Abu Dhabi");
  });

  it("safely handles empty or corrupted storage gracefully", () => {
    const userId = "staff-user-456";
    expect(loadStoredPosts(userId)).toEqual([]);

    storage.set(`official_staff_content_cache_${userId}`, "{ invalid json");
    expect(loadStoredPosts(userId)).toEqual([]);
  });

  it("maps remote content items and maps platforms correctly", () => {
    const item = mapContentItem({
      id: "123e4567-e89b-42d3-a456-426614174001",
      platform: "FACEBOOK",
      caption: "Overcoming fear of water",
      visualPrompt: "Gentle coach in pool",
      status: "approved",
      createdAt: "2026-10-16T10:00:00Z",
    });

    expect(item).not.toBeNull();
    expect(item?.platform).toBe("facebook");
    expect(item?.status).toBe("Claimed");
  });
});
