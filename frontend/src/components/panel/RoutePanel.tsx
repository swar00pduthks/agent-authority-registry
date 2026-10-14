import type { CSSProperties } from "react";
import { accentVar, type RouteModel } from "../../lib/route";
import { FileCard } from "./FileCard";
import { InputBody } from "./InputBody";
import { PlanBody } from "./PlanBody";
import { Hint, Section } from "./Section";
import { SkillsToolsBody } from "./SkillsToolsBody";

type Props = { model: RouteModel; onRestart?: () => void; onClose?: () => void };

/** Presentational: everything it shows comes from the RouteModel. */
export function RoutePanel({ model, onRestart, onClose }: Props) {
  const { stage, path, steps, inputs, outputs, skills, tools, answers } = model;
  const done = steps.filter((s) => s.status === "completed").length;
  const style = { "--line": accentVar(path?.accent) } as CSSProperties;
  const discovering = stage === "empty" || stage === "discovering";

  return (
    <div className="panel-inner" style={style}>
      <header className="panel-head">
        <div>
          <h2 className="panel-title">Your route</h2>
          {(stage === "planned" || stage === "done") && (
            <p className="panel-sub" aria-live="polite">
              {stage === "done" ? "All steps done" : `${done} of ${steps.length} steps done`}
            </p>
          )}
        </div>
        {onClose && (
          <button className="icon-btn panel-close" onClick={onClose} aria-label="Close route">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </header>

      <Section title="Plan">
        <PlanBody model={model} />
      </Section>

      <Section title="Output" count={outputs.length} open={outputs.length > 0}>
        {outputs.length === 0 ? (
          <Hint>Files the agent creates appear here, ready to open or download.</Hint>
        ) : (
          <ul className="files" aria-label="Files created">
            {outputs.map((f) => (
              <FileCard key={f.url ?? f.name} file={f} output />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Input" count={inputs.length + answers.length} open={discovering}>
        <InputBody model={model} />
      </Section>

      <Section title="Skills and tools" count={skills.length + tools.length} open={false}>
        <SkillsToolsBody model={model} />
      </Section>

      {stage !== "empty" && onRestart && (
        <footer className="panel-foot">
          <button className="btn-ghost" onClick={onRestart}>
            Start over
          </button>
        </footer>
      )}
    </div>
  );
}
