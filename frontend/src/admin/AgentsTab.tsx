import { useEffect, useMemo, useState } from "react";
import { api, type Agent, type Profile, type Revision, type SkillRow, type ToolRow, type UiRow } from "./api";
import { Chip, Field, Notice, Panel, useAction, useCan, useLoad, when } from "./ui";

const ENVS = ["dev", "uat", "prod"] as const;

/** Latest version of every id, among versions that are not revoked. */
const choices = <T extends { id: string; version: string; status: string }>(rows: T[]) => {
  const out = new Map<string, T[]>();
  for (const r of rows.filter((x) => x.status !== "revoked")) out.set(r.id, [...(out.get(r.id) ?? []), r]);
  return out;
};

function PinCard({ agent, env, revisions, run }: { agent: Agent; env: string; revisions: Revision[]; run: ReturnType<typeof useAction>["run"] }) {
  const pinned = agent.pins[env];
  const [pick, setPick] = useState<number | "">("");
  const rev = revisions.find((r) => r.id === pinned);
  const can = useCan("approve");
  return (
    <div className="pin-card">
      <h3>{env}</h3>
      <p>{rev ? <>Revision #{rev.id} <Chip status={rev.status} /></> : "Nothing pinned"}</p>
      {can && <div className="pin-row">
        <select value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label={`Revision to pin to ${env}`}>
          <option value="">Choose a revision</option>
          {revisions.map((r) => <option key={r.id} value={r.id}>#{r.id} {r.status}{r.note ? ` · ${r.note}` : ""}</option>)}
        </select>
        <button className="btn-ghost sm" disabled={pick === ""} onClick={() => run(`Pinned revision #${pick} to ${env}`, () => api(`/v1/agents/${agent.id}/pins/${env}`, { method: "PUT", body: { revision: pick } }))}>Pin</button>
      </div>}
    </div>
  );
}

function Editor({ base, run, agent }: { base: Profile; agent: string; run: ReturnType<typeof useAction>["run"] }) {
  const skills = useLoad(() => api<SkillRow[]>("/v1/skills"));
  const tools = useLoad(() => api<ToolRow[]>("/v1/tools"));
  const ui = useLoad(() => api<UiRow[]>("/v1/ui"));
  const [draft, setDraft] = useState<Profile>(base);
  const [note, setNote] = useState("");
  useEffect(() => setDraft(base), [base]);

  const sk = useMemo(() => choices(skills.data ?? []), [skills.data]);
  const tl = useMemo(() => choices(tools.data ?? []), [tools.data]);
  const ux = useMemo(() => choices(ui.data ?? []), [ui.data]);

  const toggle = <K extends "skills" | "tools" | "ui">(kind: K, key: "id" | "name", id: string, version: string, on: boolean) =>
    setDraft((d) => ({ ...d, [kind]: [...(d[kind] as any[]).filter((x) => x[key] !== id), ...(on ? [{ [key]: id, version }] : [])] }));
  const picked = (kind: "skills" | "tools" | "ui", key: "id" | "name", id: string) => (draft[kind] as any[]).find((x) => x[key] === id) as { version: string } | undefined;

  const group = (title: string, kind: "skills" | "tools" | "ui", key: "id" | "name", map: Map<string, { id: string; version: string; status: string }[]>) => (
    <fieldset className="pick">
      <legend>{title}</legend>
      {[...map.entries()].map(([id, versions]) => {
        const sel = picked(kind, key, id);
        return (
          <div key={id} className="pick-row">
            <label><input type="checkbox" checked={!!sel} onChange={(e) => toggle(kind, key, id, sel?.version ?? versions[0].version, e.target.checked)} /> {id}</label>
            <select value={sel?.version ?? versions[0].version} disabled={!sel} onChange={(e) => toggle(kind, key, id, e.target.value, true)} aria-label={`${id} version`}>
              {versions.map((v) => <option key={v.version} value={v.version}>{v.version} · {v.status}</option>)}
            </select>
          </div>
        );
      })}
    </fieldset>
  );

  return (
    <Panel title="New revision (starts from the latest)">
      <div className="adm-form">
        <Field label="Model (informational in this prototype)"><input value={draft.model ?? ""} onChange={(e) => setDraft({ ...draft, model: e.target.value })} /></Field>
        <h3 className="adm-h3">Prompt sections</h3>
        {draft.prompt.sections.map((s, i) => (
          <Field key={s.id} label={s.title}>
            <textarea rows={4} value={s.text} onChange={(e) => setDraft({ ...draft, prompt: { sections: draft.prompt.sections.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) } })} />
          </Field>
        ))}
        <h3 className="adm-h3">Discovery questions</h3>
        {draft.questions.map((q, i) => (
          <div key={q.id} className="q-row">
            <input aria-label={`Question ${i + 1}`} value={q.label} onChange={(e) => setDraft({ ...draft, questions: draft.questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input aria-label={`Options for question ${i + 1}`} value={q.options.join(", ")} onChange={(e) => setDraft({ ...draft, questions: draft.questions.map((x, j) => (j === i ? { ...x, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)) })} />
          </div>
        ))}
        {group("Skills", "skills", "id", sk)}
        {group("Tools", "tools", "id", tl)}
        {group("UI components", "ui", "name", ux)}
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" /></Field>
        <p className="adm-note">Saved as a draft. Someone else approves it, then pins it to an environment.</p>
        <button className="btn-primary" onClick={() => run("Saved a new draft revision", () => api(`/v1/agents/${agent}/revisions`, { method: "POST", body: { config: draft, note } }))}>Save as draft revision</button>
      </div>
    </Panel>
  );
}

export function AgentsTab() {
  const agents = useLoad(() => api<Agent[]>("/v1/agents"));
  const agent = agents.data?.[0];
  const revs = useLoad(() => (agent ? api<Revision[]>(`/v1/agents/${agent.id}/revisions`) : Promise.resolve([])), [agent?.id]);
  const { message, run } = useAction(() => { agents.reload(); revs.reload(); });
  if (!agent) return <Panel title="Agents"><p className="adm-note">{agents.error ?? "No agents registered yet."}</p></Panel>;
  const revisions = revs.data ?? [];
  const canApprove = useCan("approve");
  const canPublish = useCan("publish");

  return (
    <>
      <Panel title={`Environments: ${agent.name}`}>
        <Notice message={message} />
        <div className="pins">{ENVS.map((e) => <PinCard key={e} agent={agent} env={e} revisions={revisions} run={run} />)}</div>
        <p className="adm-note">uat and prod only take approved revisions, and the person who created a revision cannot pin it there.</p>
      </Panel>

      <Panel title="Revisions">
        <table className="adm-table">
          <thead><tr><th>#</th><th>Status</th><th>Note</th><th>Created by</th><th>Contents</th><th /></tr></thead>
          <tbody>
            {revisions.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td><td><Chip status={r.status} /></td><td>{r.note}</td>
                <td>{r.created_by}<small>{when(r.created_at)}</small></td>
                <td><small>{r.config.skills.map((s) => `${s.id}@${s.version}`).join(", ")}</small><small>{r.config.tools.map((s) => `${s.id}@${s.version}`).join(", ")}</small></td>
                <td className="row-actions">
                  {canApprove && r.status === "draft" && <button className="btn-ghost sm" onClick={() => run(`Approved revision #${r.id}`, () => api(`/v1/revisions/${r.id}/status`, { method: "PUT", body: { status: "approved" } }))}>Approve</button>}
                  {canApprove && r.status !== "revoked" && <button className="btn-ghost sm" onClick={() => run(`Revoked revision #${r.id}`, () => api(`/v1/revisions/${r.id}/status`, { method: "PUT", body: { status: "revoked" } }))}>Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {canPublish && revisions[0] && <Editor base={revisions[0].config} agent={agent.id} run={run} />}
    </>
  );
}
