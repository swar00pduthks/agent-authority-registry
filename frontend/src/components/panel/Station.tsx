import type { Step } from "../../lib/route";
import { FileCard } from "./FileCard";
import { Check, Chevron, Person } from "./icons";

type Props = { step: Step; current: boolean };

/** One step on the route. You-steps are drawn as larger interchanges. */
export function Station({ step, current }: Props) {
  const who = step.owner === "you" ? "You" : "Agent";
  const label =
    step.status === "completed"
      ? `Done by ${who.toLowerCase()}`
      : current
        ? step.owner === "you"
          ? "Your turn"
          : "In progress"
        : who;

  const expandable = step.status !== "pending" && (step.activity.length > 0 || step.files.length > 0);
  const heading = (
    <>
      <span className="st-text">{step.text}</span>
      <span className="st-who">{label}</span>
    </>
  );

  return (
    <li
      className="st"
      data-owner={step.owner}
      data-status={step.status}
      data-current={current || undefined}
      aria-current={current ? "step" : undefined}
    >
      <span className="st-mark">
        {step.status === "completed" ? <Check /> : step.owner === "you" ? <Person /> : null}
      </span>

      {expandable ? (
        <details className="st-details" open={current || undefined}>
          <summary className="st-sum">
            <span className="st-body">{heading}</span>
            <Chevron className="st-chev" />
          </summary>
          <div className="st-more">
            {step.activity.length > 0 && (
              <ul className="st-used" aria-label="What the agent did">
                {step.activity.map((a) => (
                  <li key={a.label}>{a.count > 1 ? `${a.label} (${a.count})` : a.label}</li>
                ))}
              </ul>
            )}
            {step.files.length > 0 && (
              <ul className="files" aria-label="Files from this step">
                {step.files.map((f) => (
                  <FileCard key={f.url ?? f.name} file={f} output />
                ))}
              </ul>
            )}
          </div>
        </details>
      ) : (
        <span className="st-body">{heading}</span>
      )}
    </li>
  );
}
