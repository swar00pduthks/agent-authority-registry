import { useState } from "react";
import { api, type AuditRow, type UsageRow } from "./api";
import { Notice, Panel, useAction, useLoad, when } from "./ui";

export function ActivityTab() {
  const audit = useLoad(() => api<AuditRow[]>("/v1/audit"));
  const usage = useLoad(() => api<UsageRow[]>("/v1/usage"));
  const [verdict, setVerdict] = useState<string | null>(null);
  const { message } = useAction(() => {});

  return (
    <>
      <Panel title="Conversations and what they run" aside={<button className="btn-ghost sm" onClick={usage.reload}>Refresh</button>}>
        <table className="adm-table">
          <thead><tr><th>Conversation</th><th>Env</th><th>Revision</th><th>Skills</th><th>Tools</th><th>Started</th></tr></thead>
          <tbody>
            {(usage.data ?? []).map((u) => (
              <tr key={u.thread_id}>
                <td><code>{u.thread_id.slice(-8)}</code></td><td>{u.env}</td><td>#{u.revision_id}</td>
                <td><small>{Object.entries(u.snapshot.skills ?? {}).map(([k, v]) => `${k}@${v}`).join(", ")}</small></td>
                <td><small>{Object.entries(u.snapshot.tools ?? {}).map(([k, v]) => `${k}@${v}`).join(", ")}</small></td>
                <td>{when(u.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Audit log" aside={<button className="btn-ghost sm" onClick={() => api<{ ok: boolean; entries?: number; broken_at?: number }>("/v1/audit/verify").then((v) => setVerdict(v.ok ? `Chain intact: ${v.entries} entries` : `Tampering detected at entry ${v.broken_at}`)).catch((e: Error) => setVerdict(e.message))}>Verify chain</button>}>
        {verdict && <p className="notice" data-ok={verdict.startsWith("Chain")}>{verdict}</p>}
        <Notice message={message} />
        <table className="adm-table">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Detail</th></tr></thead>
          <tbody>
            {(audit.data ?? []).map((a) => (
              <tr key={a.id}><td>{when(a.ts)}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.target}</td><td><small>{Object.keys(a.detail).length ? JSON.stringify(a.detail) : ""}</small></td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
