import { useEffect, useState, type FormEvent } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { useLangGraphInterruptState } from "@assistant-ui/react-langgraph";
import { useResume } from "../../hooks/useResume";

type Args = { question?: string; options?: string[] };

const clean = (r: unknown) => {
  const s = typeof r === "string" ? r : JSON.stringify(r);
  return s.replace(/^"|"$/g, "");
};

/**
 * Renders the agent's `ask_user` tool call, used for the steps only the person
 * can do. While the graph is paused it shows answer buttons (keys 1-4 work
 * too); afterwards it collapses to a one-line record of the answer.
 */
export const AskUserCard: ToolCallMessagePartComponent = ({ args, result }) => {
  const interrupt = useLangGraphInterruptState();
  const { resume, busy } = useResume();
  const [custom, setCustom] = useState("");

  const a = (args ?? {}) as Args;
  const options = Array.isArray(a.options) ? a.options : [];
  const answered = result !== undefined;
  const active = !answered && !!interrupt && !!a.question && options.length > 0;

  const answer = (value: string) => {
    const v = value.trim();
    if (v) void resume(v);
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < options.length) {
        e.preventDefault();
        answer(options[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, options.join("|"), busy]);

  if (answered) {
    return (
      <p className="answered">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{a.question}</span>
        <b>{clean(result)}</b>
      </p>
    );
  }

  if (!active) {
    return (
      <p className="ask-skel" aria-busy="true">
        Preparing the next step…
      </p>
    );
  }

  const submitCustom = (e: FormEvent) => {
    e.preventDefault();
    answer(custom);
    setCustom("");
  };

  return (
    <section className="ask" aria-label="Your turn">
      <p className="ask-meta">Your turn</p>
      <h3 className="ask-q">{a.question}</h3>
      <div className="options" role="group" aria-label="Answers">
        {options.map((o, i) => (
          <button key={o} className="option" disabled={busy} onClick={() => answer(o)}>
            <kbd aria-hidden="true">{i + 1}</kbd>
            <span>{o}</span>
          </button>
        ))}
      </div>
      <form className="ask-free" onSubmit={submitCustom}>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Or answer in your own words"
          aria-label="Answer in your own words"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !custom.trim()}>
          Send
        </button>
      </form>
    </section>
  );
};
