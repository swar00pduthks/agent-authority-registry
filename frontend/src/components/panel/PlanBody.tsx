import { useState } from "react";
import type { RouteModel } from "../../lib/route";
import { Station } from "./Station";

const plural = (n: number) => (n === 1 ? "step" : "steps");

function Discovering({ model }: { model: RouteModel }) {
  const d = model.discovery;
  if (!d) return <p className="panel-sub" aria-live="polite">Getting ready…</p>;
  const answered = model.answers.length;
  const text = d.submitted
    ? "Working out your route…"
    : d.review
      ? "Review your answers"
      : `Question ${d.step} of ${d.total}`;
  return (
    <>
      <div className="segs" role="img" aria-label={text}>
        {Array.from({ length: d.total }, (_, i) => (
          <span key={i} className="seg" data-on={i < answered || d.submitted || undefined} data-now={(!d.submitted && !d.review && i + 1 === d.step) || undefined} />
        ))}
      </div>
      <p className="panel-sub" aria-live="polite">{text}</p>
    </>
  );
}

function Steps({ model }: { model: RouteModel }) {
  const { path, steps } = model;
  const [all, setAll] = useState(false);

  const currentIndex = steps.findIndex((s) => s.status !== "completed");
  // Long routes show the current step with one before and two after, so Output and Input stay in view.
  const windowed = !all && currentIndex >= 0 && steps.length > 5;
  const start = windowed ? Math.max(0, currentIndex - 1) : 0;
  const end = windowed ? Math.min(steps.length, currentIndex + 3) : steps.length;
  const before = start;
  const after = steps.length - end;

  return (
    <>
      {path && (
        <section className="pathcard" aria-label="Recommended path">
          <h3 className="pathcard-name">{path.label} route</h3>
          {path.blurb && <p className="pathcard-blurb">{path.blurb}</p>}
          {path.version && (
            <p className="pathcard-src" data-status={path.status}>
              {path.id} v{path.version}
              {path.status && path.status !== "approved" ? `, ${path.status}` : ""}
              {path.env ? ` · ${path.env}` : ""}
            </p>
          )}
          {path.reason && <p className="pathcard-reason">{path.reason}</p>}
          {path.requirements.length > 0 && (
            <ul className="reqs" aria-label="Your requirements">
              {path.requirements.map((r) => (
                <li key={r} className="req">{r}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {steps.length === 0 && <p className="panel-sub" aria-live="polite">Building your steps…</p>}

      {steps.length > 0 && (
        <>
          {before > 0 && (
            <button className="more" onClick={() => setAll(true)}>
              Show {before} earlier {plural(before)}
            </button>
          )}
          <ol className="route">
            {steps.slice(start, end).map((s) => (
              <Station key={s.id} step={s} current={s.id === currentIndex} />
            ))}
          </ol>
          {after > 0 && (
            <button className="more" onClick={() => setAll(true)}>
              Show {after} more {plural(after)}
            </button>
          )}
          {all && steps.length > 5 && currentIndex >= 0 && (
            <button className="more" onClick={() => setAll(false)}>
              Show fewer steps
            </button>
          )}
        </>
      )}
    </>
  );
}

export function PlanBody({ model }: { model: RouteModel }) {
  if (model.stage === "empty") {
    return (
      <div className="empty-route">
        <div className="ghost" aria-hidden="true">
          <i /><i /><i />
        </div>
        <p>Answer seven short questions and your step-by-step route appears here.</p>
      </div>
    );
  }
  if (model.stage === "discovering") return <Discovering model={model} />;
  return <Steps model={model} />;
}
