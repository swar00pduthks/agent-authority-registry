import { useState } from "react";
import { api, type SkillRow, type Status } from "./api";
import { Chip, Field, Notice, Panel, useAction, useCan, useLoad, when } from "./ui";

const NEXT: Record<Status, Status[]> = { draft: ["approved", "revoked"], approved: ["deprecated", "revoked"], deprecated: ["revoked"], revoked: [] };

export function SkillsTab() {
  const { data, error, reload } = useLoad(() => api<SkillRow[]>("/v1/skills"));
  const { message, run } = useAction(reload);
  const canApprove = useCan("approve");
  const canPublish = useCan("publish");
  const [f, setF] = useState({ id: "", version: "1.0.0", label: "", blurb: "", accent: "no-code", skill_md: "---\nname: \ndescription: \n---\n\n# Steps\n\n1. [You] \n2. [Agent] \n" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <Panel title="Skills">
        {error && <p className="notice" data-ok="false">{error}</p>}
        <Notice message={message} />
        <table className="adm-table">
          <thead><tr><th>Skill</th><th>Version</th><th>Status</th><th>Published by</th><th>Approved by</th><th>Signed</th><th /></tr></thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id + s.version}>
                <td>{s.label || s.id}<small>{s.id}</small></td>
                <td>{s.version}</td>
                <td><Chip status={s.status} /></td>
                <td>{s.published_by}<small>{when(s.published_at)}</small></td>
                <td>{s.approved_by ?? ""}</td>
                <td>{s.signature ? "Yes" : "No"}</td>
                <td className="row-actions">
                  {canApprove && NEXT[s.status].map((to) => (
                    <button key={to} className="btn-ghost sm" onClick={() => run(`${s.id} ${s.version} is now ${to}`, () => api(`/v1/skills/${s.id}/${s.version}/status`, { method: "PUT", body: { status: to } }))}>
                      {to === "approved" ? "Approve" : to === "deprecated" ? "Deprecate" : "Revoke"}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {canPublish && <Panel title="Publish a skill version">
        <form className="adm-form" onSubmit={(e) => { e.preventDefault(); void run(`Published ${f.id} ${f.version} as a draft`, () => api("/v1/skills/compose", { method: "POST", body: f })); }}>
          <Field label="Id (must equal name in SKILL.md)"><input value={f.id} onChange={set("id")} required /></Field>
          <Field label="Version"><input value={f.version} onChange={set("version")} required /></Field>
          <Field label="Label"><input value={f.label} onChange={set("label")} required /></Field>
          <Field label="Blurb"><input value={f.blurb} onChange={set("blurb")} required /></Field>
          <Field label="Colour"><select value={f.accent} onChange={set("accent")}><option>no-code</option><option>low-code</option><option>pro-code</option></select></Field>
          <Field label="SKILL.md"><textarea rows={9} value={f.skill_md} onChange={set("skill_md")} required /></Field>
          <p className="adm-note">A new version is always a draft. A different person approves it, and approval signs it.</p>
          <button className="btn-primary" type="submit">Publish draft</button>
        </form>
      </Panel>}
    </>
  );
}
