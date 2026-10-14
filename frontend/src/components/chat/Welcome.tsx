import { useAui } from "@assistant-ui/react";

const SUGGESTIONS = [
  {
    title: "Answer questions from our documents",
    hint: "A knowledge assistant for policies, guides or FAQs",
    prompt: "I want an AI assistant that answers questions from our documents",
  },
  {
    title: "Automate a repetitive workflow",
    hint: "Triage, routing, approvals, reports",
    prompt: "I want to automate a repetitive workflow with AI",
  },
  {
    title: "Build a custom agent for regulated data",
    hint: "Custom tools, testing and audit",
    prompt: "I want to build a custom AI agent that works with regulated data",
  },
  {
    title: "I'm not sure yet",
    hint: "Seven questions will work it out",
    prompt: "I'm not sure what I need. Help me work it out.",
  },
];

export function Welcome() {
  const aui = useAui();
  return (
    <section className="welcome">
      <h1>Find the right way to build your AI agent</h1>
      <p>
        Answer seven short questions about what you need. You get a route with
        every step, and what you do versus what the agent does. Attach a brief
        or a deck if you have one.
      </p>
      <div className="suggestions" role="group" aria-label="Suggested prompts">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            className="suggestion"
            onClick={() => aui.thread().append({ role: "user", content: [{ type: "text", text: s.prompt }] })}
          >
            <span className="suggestion-title">{s.title}</span>
            <span className="suggestion-hint">{s.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
