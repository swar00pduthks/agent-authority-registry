/** Contract between the agent's `collect_requirements` interrupt and the UI. */

export type Question = { id: string; label: string; options: string[] };

export type FormInterrupt = {
  kind: "form";
  title: string;
  questions: Question[];
  prefill: Record<string, string>;
};

/** Answers keyed by question id. */
export type AnswerMap = Record<string, string>;

/** What the form reports while the person fills it in. `step === questions.length` is the review screen. */
export type Draft = { answers: AnswerMap; step: number };

export type SubmittedAnswer = { id: string; question: string; answer: string };

export const isFormInterrupt = (v: unknown): v is FormInterrupt =>
  !!v &&
  typeof v === "object" &&
  (v as FormInterrupt).kind === "form" &&
  Array.isArray((v as FormInterrupt).questions);

/** The tool result: `{"answers":[{id,question,answer}]}`. */
export const parseSubmitted = (result: unknown): SubmittedAnswer[] | null => {
  try {
    const o = typeof result === "string" ? JSON.parse(result) : (result as any);
    if (Array.isArray(o?.answers)) return o.answers;
  } catch {
    /* an error string from the tool */
  }
  return null;
};
