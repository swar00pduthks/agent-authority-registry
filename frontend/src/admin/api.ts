/** Typed access to the registry service. The token lives in sessionStorage only. */

export type Status = "draft" | "approved" | "deprecated" | "revoked";

export type SkillRow = { id: string; version: string; status: Status; label: string; blurb: string; accent: string; description: string; sha256: string; signature: string | null; published_by: string; approved_by: string | null; published_at: string };
export type ToolRow = { id: string; version: string; status: Status; kind: "builtin" | "mcp"; description: string; spec: Record<string, any>; published_by: string; published_at: string };
export type UiRow = { id: string; version: string; status: Status; component: string; description: string; published_by: string; published_at: string };
export type Question = { id: string; label: string; options: string[] };
export type Section = { id: string; title: string; text: string };
export type Profile = {
  model?: string;
  prompt: { sections: Section[] };
  questions: Question[];
  skills: { id: string; version: string }[];
  tools: { id: string; version: string }[];
  ui: { name: string; version: string }[];
};
export type Revision = { id: number; agent_id: string; status: Status; note: string; config: Profile; created_at: string; created_by: string };
export type Agent = { id: string; name: string; pins: Record<string, number> };
export type AuditRow = { id: number; ts: string; actor: string; action: string; target: string; detail: Record<string, any>; hash: string };
export type UsageRow = { thread_id: string; agent_id: string; env: string; revision_id: number; snapshot: Record<string, Record<string, string>>; started_at: string };

const KEY = "registry-token";
export const getToken = () => {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
export const setToken = (t: string) => {
  try {
    t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the token lasts until reload */
  }
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`/registry${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${getToken()}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = r.status === 204 ? null : await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data?.error ?? `Request failed (${r.status})`, data);
  return data as T;
}
