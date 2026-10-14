import { useCallback, useEffect, useRef } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { useLangGraphInterruptState } from "@assistant-ui/react-langgraph";
import { useResume } from "../../hooks/useResume";
import { isFormInterrupt, parseSubmitted, type AnswerMap, type Draft } from "../../lib/requirements";
import { useDraft } from "./DraftContext";
import { RequirementsStepper } from "./RequirementsStepper";

/**
 * Connector for the `collect_requirements` tool call: reads the interrupt,
 * renders the stepper, mirrors the draft to the panel and resumes the graph
 * with ONE JSON string when the person submits.
 */
export const RequirementsToolUI: ToolCallMessagePartComponent = ({ result }) => {
  const interrupt = useLangGraphInterruptState();
  const { resume, busy } = useResume();
  const { setDraft } = useDraft();

  const form = isFormInterrupt(interrupt?.value) ? interrupt!.value : null;
  const submitted = result !== undefined ? parseSubmitted(result) : null;

  const onProgress = useCallback((d: Draft) => setDraft(d), [setDraft]);
  const onSubmit = (answers: AnswerMap) => void resume(JSON.stringify(answers));

  const hadForm = useRef(false);
  if (form) hadForm.current = true;

  useEffect(() => () => setDraft(null), [setDraft]);

  if (submitted) {
    return (
      <p className="answered">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Requirements sent</span>
        <b>{submitted.length} answers</b>
      </p>
    );
  }

  if (result === undefined && form) {
    return (
      <RequirementsStepper
        title={form.title}
        questions={form.questions}
        prefill={form.prefill}
        busy={busy}
        onSubmit={onSubmit}
        onProgress={onProgress}
      />
    );
  }

  return (
    <p className="ask-skel" aria-busy="true">
      {result !== undefined
        ? "Could not read the answers."
        : hadForm.current
          ? "Sending your answers…"
          : "Preparing your questions…"}
    </p>
  );
};
