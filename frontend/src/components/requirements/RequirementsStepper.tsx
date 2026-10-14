import { useEffect, useMemo, useState } from "react";
import type { AnswerMap, Draft, Question } from "../../lib/requirements";

type Props = {
  title: string;
  questions: Question[];
  /** Pre-selected answers, keyed by question id. */
  prefill?: AnswerMap;
  busy?: boolean;
  onSubmit: (answers: AnswerMap) => void;
  /** Called on every change so other UI (the route panel) can mirror the draft. */
  onProgress?: (draft: Draft) => void;
};

/**
 * One form, one question at a time, ending in a review screen.
 * Presentational: it knows nothing about LangGraph or assistant-ui.
 */
export function RequirementsStepper({ title, questions, prefill = {}, busy, onSubmit, onProgress }: Props) {
  const total = questions.length;
  const [answers, setAnswers] = useState<AnswerMap>(prefill);
  const [step, setStep] = useState(0);
  const [suggested, setSuggested] = useState<Set<string>>(() => new Set(Object.keys(prefill)));

  useEffect(() => {
    onProgress?.({ answers, step });
  }, [answers, step, onProgress]);

  const review = step >= total;
  const q = questions[step];
  const current = q ? (answers[q.id] ?? "") : "";
  const custom = q && current && !q.options.includes(current) ? current : "";
  const missing = useMemo(() => questions.filter((x) => !answers[x.id]?.trim()), [questions, answers]);

  const set = (id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setSuggested((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };

  const next = () => setStep((s) => Math.min(total, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  // 1-9 picks an option and 'Enter' moves on, unless the person is typing.
  useEffect(() => {
    if (!q || busy) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < q.options.length) {
        e.preventDefault();
        set(q.id, q.options[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, busy]);

  return (
    <section className="form" aria-label={title}>
      <div className="form-top">
        <p className="form-title">{title}</p>
        <p className="form-count" aria-live="polite">
          {review ? "Review" : `Question ${step + 1} of ${total}`}
        </p>
      </div>
      <div className="segs" aria-hidden="true">
        {questions.map((x, i) => (
          <span key={x.id} className="seg" data-on={answers[x.id] ? "" : undefined} data-now={i === step ? "" : undefined} />
        ))}
      </div>

      {!review && q && (
        <div key={q.id} className="form-step">
          <h3 className="ask-q" id={`q-${q.id}`}>{q.label}</h3>
          {suggested.has(q.id) && <p className="form-hint">Suggested from your message. Change it if it is not right.</p>}
          <div className="options" role="radiogroup" aria-labelledby={`q-${q.id}`}>
            {q.options.map((o, i) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={current === o}
                className="option"
                data-selected={current === o || undefined}
                disabled={busy}
                onClick={() => set(q.id, o)}
              >
                <kbd aria-hidden="true">{i + 1}</kbd>
                <span>{o}</span>
              </button>
            ))}
          </div>
          <input
            className="form-other"
            value={custom}
            onChange={(e) => set(q.id, e.target.value)}
            placeholder="Or type your own answer"
            aria-label="Type your own answer"
            disabled={busy}
          />
        </div>
      )}

      {review && (
        <div className="form-step">
          <h3 className="ask-q">Check your answers</h3>
          <dl className="review">
            {questions.map((x, i) => (
              <div key={x.id} className="review-row">
                <dt>{x.label}</dt>
                <dd>{answers[x.id] || <em>Not answered</em>}</dd>
                <button type="button" className="link" onClick={() => setStep(i)} disabled={busy}>
                  Change
                </button>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="form-nav">
        <button type="button" className="btn-ghost" onClick={back} disabled={step === 0 || busy}>
          Back
        </button>
        {review ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || missing.length > 0}
            onClick={() => onSubmit(answers)}
          >
            {busy ? "Sending…" : "Get my route"}
          </button>
        ) : (
          <button type="button" className="btn-primary" disabled={!current.trim() || busy} onClick={next}>
            {step === total - 1 ? "Review" : "Next"}
          </button>
        )}
      </div>
    </section>
  );
}
