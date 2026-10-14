import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "./api";

export const Chip = ({ status }: { status: string }) => <span className="chip-status" data-status={status}>{status}</span>;

/** Loads data and exposes a reload; errors are shown, not thrown. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    load().then((d) => { setData(d); setError(null); }).catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

/** Runs an action, reports the server's reason when it refuses. */
export function useAction(after: () => void) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setMessage({ ok: true, text: label });
      after();
    } catch (e) {
      const err = e as ApiError;
      const extra = (err.detail as any)?.blocked ?? (err.detail as any)?.missing;
      setMessage({ ok: false, text: err.message + (extra ? `: ${extra.join(", ")}` : "") });
    }
  };
  return { message, run };
}

export const Notice = ({ message }: { message: { ok: boolean; text: string } | null }) =>
  message ? <p className="notice" data-ok={message.ok} role="status">{message.text}</p> : null;

export const Panel = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="adm-panel">
    <header><h2>{title}</h2>{aside}</header>
    {children}
  </section>
);

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field"><span>{label}</span>{children}</label>
);

export const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

/** Who is signed in. The server enforces every rule; this only hides controls that would be refused. */
const PERMS: Record<string, string[]> = {
  reader: ["read"], agent: ["read", "usage"], publisher: ["read", "publish"], approver: ["read", "approve"],
  admin: ["read", "usage", "publish", "approve", "admin"],
};
export const Who = createContext<{ name: string; roles: string } | null>(null);
export const useCan = (perm: string) => {
  const who = useContext(Who);
  return !!who && who.roles.split(",").some((r) => PERMS[r]?.includes(perm));
};
