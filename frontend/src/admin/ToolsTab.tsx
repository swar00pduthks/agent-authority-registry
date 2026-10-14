import { useState } from "react";
import { api, type ToolRow, type UiRow, type Status } from "./api";
import { Chip, Field, Notice, Panel, useAction, useCan, useLoad } from "./ui";
import { COMPONENTS } from "../lib/agentConfig";

const NEXT: Record<Status, Status[]> = { draft: ["approved", "revoked"], approved: ["deprecated", "revoked"], deprecated: ["revoked"], revoked: [] };

function Actions({ path, id, version, status, run }: { path: string; id: string; version: string; status: Status; run: ReturnType<typeof useAction>["run"] }) {
  const can = useCan("approve");
  return (
    <td className="row-actions">
      {can && NEXT[status].map((to) => (
        <button key={to} className="btn-ghost sm" onClick={() => run(`${id} ${version} is now ${to}`, () => api(`/v1/${path}/${id}/${version}/status`, { method: "PUT", body: { status: to } }))}>
          {to === "approved" ? "Approve" : to === "deprecated" ? "Deprecate" : "Revoke"}
        </button>
      ))}
    </td>
  );
}

export function ToolsTab() {
  const tools = useLoad(() => api<ToolRow[]>("/v1/tools"));
  const ui = useLoad(() => api<UiRow[]>("/v1/ui"));
  const { message, run } = useAction(() => { tools.reload(); ui.reload(); });
  const canPublish = useCan("publish");
  const [t, setT] = useState({ id: "", version: "1.0.0", description: "", url: "http://127.0.0.1:8810/mcp", allow: "", auth_env: "" });
  const [u, setU] = useState({ id: "", version: "1.0.0", component: Object.keys(COMPONENTS)[0], description: "" });

  return (
    <>
      <Panel title="Tools">
        <Notice message={message} />
        <table className="adm-table">
          <thead><tr><th>Tool</th><th>Version</th><th>Kind</th><th>Status</th><th>Details</th><th /></tr></thead>
          <tbody>
            {(tools.data ?? []).map((x) => (
              <tr key={x.id + x.version}>
                <td>{x.id}<small>{x.description}</small></td>
                <td>{x.version}</td>
                <td>{x.kind === "mcp" ? "MCP server" : "Built in"}</td>
                <td><Chip status={x.status} /></td>
                <td>{x.kind === "mcp" ? <><code>{x.spec.url}</code><small>allows {(x.spec.allow ?? []).join(", ")}{x.spec.digest ? " · digest pinned" : ""}</small></> : ""}</td>
                <Actions path="tools" id={x.id} version={x.version} status={x.status} run={run} />
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {canPublish && <Panel title="Register an MCP server">
        <form className="adm-form" onSubmit={(e) => { e.preventDefault(); void run(`Registered ${t.id} ${t.version} as a draft`, () => api("/v1/tools", { method: "POST", body: { id: t.id, version: t.version, kind: "mcp", description: t.description, spec: { url: t.url, allow: t.allow.split(",").map((s) => s.trim()).filter(Boolean), ...(t.auth_env ? { auth_env: t.auth_env } : {}) } } })); }}>
          <Field label="Id (letters, digits, underscore)"><input value={t.id} onChange={(e) => setT({ ...t, id: e.target.value })} required pattern="[a-zA-Z0-9_]+" /></Field>
          <Field label="Version"><input value={t.version} onChange={(e) => setT({ ...t, version: e.target.value })} required /></Field>
          <Field label="Description"><input value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} required /></Field>
          <Field label="Server URL"><input value={t.url} onChange={(e) => setT({ ...t, url: e.target.value })} required /></Field>
          <Field label="Allowed tools (comma separated)"><input value={t.allow} onChange={(e) => setT({ ...t, allow: e.target.value })} required /></Field>
          <Field label="Name of the environment variable holding its token (optional)"><input value={t.auth_env} onChange={(e) => setT({ ...t, auth_env: e.target.value })} placeholder="STANDARDS_TOKEN" /></Field>
          <p className="adm-note">Only the variable's name is stored, never a secret. The agent only connects to hosts on its own allowlist.</p>
          <button className="btn-primary" type="submit">Register draft</button>
        </form>
      </Panel>}

      <Panel title="UI components">
        <table className="adm-table">
          <thead><tr><th>Tool</th><th>Version</th><th>Component</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(ui.data ?? []).map((x) => (
              <tr key={x.id + x.version}>
                <td>{x.id}<small>{x.description}</small></td>
                <td>{x.version}</td>
                <td>{x.component}</td>
                <td><Chip status={x.status} /></td>
                <Actions path="ui" id={x.id} version={x.version} status={x.status} run={run} />
              </tr>
            ))}
          </tbody>
        </table>
        {canPublish && <form className="adm-form" onSubmit={(e) => { e.preventDefault(); void run(`Registered the ${u.id} component mapping`, () => api("/v1/ui", { method: "POST", body: u })); }}>
          <Field label="Tool name"><input value={u.id} onChange={(e) => setU({ ...u, id: e.target.value })} required /></Field>
          <Field label="Version"><input value={u.version} onChange={(e) => setU({ ...u, version: e.target.value })} required /></Field>
          <Field label="Component shipped in the app">
            <select value={u.component} onChange={(e) => setU({ ...u, component: e.target.value })}>{Object.keys(COMPONENTS).map((k) => <option key={k}>{k}</option>)}</select>
          </Field>
          <Field label="Description"><input value={u.description} onChange={(e) => setU({ ...u, description: e.target.value })} /></Field>
          <p className="adm-note">The registry chooses among components the app already ships. It cannot load new code.</p>
          <button className="btn-primary" type="submit">Register draft</button>
        </form>}
      </Panel>
    </>
  );
}
