import type { RouteModel } from "../../lib/route";
import { Hint } from "./Section";

export function SkillsToolsBody({ model }: { model: RouteModel }) {
  const { skills, tools } = model;
  return (
    <>
      {skills.length === 0 && tools.length === 0 && <Hint>Skills and tools show here as the agent uses them.</Hint>}
      {skills.length > 0 && (
        <>
          <h4 className="sub">Skills</h4>
          <ul className="skills">
            {skills.map((s) => (
              <li key={s.id} className="skill">{s.label}<span className="tool-meta">v{s.version}</span></li>
            ))}
          </ul>
        </>
      )}
      {tools.length > 0 && (
        <>
          <h4 className="sub">Tools</h4>
          <ul className="tools">
            {tools.map((t) => (
              <li key={t.name} className="tool" data-running={t.running || undefined}>
                <span>{t.label}</span>
                <span className="tool-meta">{t.running ? "Running" : t.count > 1 ? `${t.count} times` : "Used"}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
