import { useEffect, useState } from "react";

export type Platform = "facebook" | "instagram" | "tiktok";
export type PostStatus = "Needs Review" | "Scheduled" | "Claimed" | "Published";
export type Post = {
  id: string;
  platform: Platform;
  caption: string;
  visual: string; // design / video brief
  status: PostStatus;
  scheduledAt?: string;
  createdAt: string;
};

const KEY = "cockpit-posts";
const EVT = "cockpit-posts-change";

function read(): Post[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function usePosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => {
    const sync = () => setPosts(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const save = (next: Post[]) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVT));
  };
  return { posts, save };
}
