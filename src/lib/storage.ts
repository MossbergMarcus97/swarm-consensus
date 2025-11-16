const STORAGE_KEY = "swarm_conversations_v1";

function getStorageKey(userId?: string) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function parseItem<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadConversations<T>(userId?: string): T[] {
  if (typeof window === "undefined") return [];

  const userKey = getStorageKey(userId);
  const stored = parseItem<T>(window.localStorage.getItem(userKey));
  if (stored.length || !userId) {
    return stored;
  }

  // Backwards compatibility: migrate shared state into the user-specific bucket.
  const legacy = parseItem<T>(window.localStorage.getItem(STORAGE_KEY));
  if (legacy.length) {
    try {
      window.localStorage.setItem(userKey, JSON.stringify(legacy));
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to migrate legacy conversations", error);
    }
  }
  return legacy;
}

export function saveConversations<T>(conversations: T[], userId?: string) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(userId);
  try {
    window.localStorage.setItem(key, JSON.stringify(conversations));
    if (userId) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.error("Failed to persist conversations", error);
  }
}

