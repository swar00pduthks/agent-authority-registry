import { useMemo } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useLangGraphInterruptState } from "@assistant-ui/react-langgraph";
import { useDraft } from "../components/requirements/DraftContext";
import { isFormInterrupt, parseSubmitted, type Draft } from "./requirements";

export type StepStatus = "pending" | "in_progress" | "completed";

/** What the agent did while a step was in progress, shown when the step expands. */
export type StepActivity = { label: string; count: number };

export type Step = {
  id: number;
  text: string;
  owner: "you" | "agent";
  status: StepStatus;
  activity: StepActivity[];
  files: FileRef[];
};

export type Answer = { id: string; question: string; answer: string };

/** Progress through the requirements form. `step` is 1-based; `review` is the last screen. */
export type Discovery = { step: number; total: number; review: boolean; submitted: boolean };

/** A file the user attached (input) or the agent published (output). */
export type FileRef = {
  name: string;
  mime?: string;
  size?: number;
  url?: string;
};

export type ToolUse = {
  name: string;
  label: string;
  count: number;
  running: boolean;
};

/** The recommended path: a skill from the registry, with the version this conversation uses. */
export type PathInfo = {
  id: string;
  label: string;
  blurb: string;
  /** A token name ("low-code") or a hex colour. */
  accent: string;
  version?: string;
  status?: string;
  env?: string;
  reason: string;
  requirements: string[];
};

export type SkillUse = { id: string; label: string; version: string };

/** Colour of the route line for a path. */
export const accentVar = (accent: string | undefined): string =>
  !accent ? "var(--ink-3)" : accent.startsWith("#") ? accent : `var(--${accent}, var(--ink-3))`;

export type RouteModel = {
  stage: "empty" | "discovering" | "planned" | "done";
  discovery: Discovery | null;
  answers: Answer[];
  path: PathInfo | null;
  steps: Step[];
  inputs: FileRef[];
  outputs: FileRef[];
  skills: SkillUse[];
  tools: ToolUse[];
};

const TOOL_LABELS: Record<string, string> = {
  collect_requirements: "Collect your requirements",
  ask_user: "Ask you a question",
  load_tool: "Load a tool",
  recommend_path: "Recommend a path",
  write_todos: "Plan the steps",
  read_file: "Read a file",
  write_file: "Write a file",
  edit_file: "Edit a file",
  publish_file: "Publish a file",
  ls: "List files",
  glob: "Find files",
  grep: "Search files",
  task: "Delegate to a subagent",
};

const asString = (v: unknown) => (typeof v === "string" ? v : "");

const parseStep = (raw: string, id: number, status: StepStatus): Step => {
  const m = raw.match(/^\[(You|Agent)\]\s*/i);
  return {
    id,
    owner: m && m[1].toLowerCase() === "you" ? "you" : "agent",
    text: raw.replace(/^\[(You|Agent)\]\s*/i, ""),
    status,
    activity: [],
    files: [],
  };
};

/** Tools that are part of the guided flow itself, not step activity. */
const FLOW_TOOLS = new Set(["write_todos", "recommend_path", "ask_user", "collect_requirements"]);

/** "low-code-path" -> "Low-code path" */
const skillLabel = (slug: string) => {
  const s = slug.replace(/-path$/, " path").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** recommend_path returns {"path": {id, version, status, env, label, blurb, accent}, "reason": ...}. */
const parsePath = (result: unknown): Partial<PathInfo> | null => {
  try {
    const o = typeof result === "string" ? JSON.parse(result) : (result as any);
    return o?.path && typeof o.path === "object" ? o.path : null;
  } catch {
    return null; /* an error message, for example */
  }
};

/** publish_file returns {"type":"file","name":...,"url":...} as a string. */
const parseFile = (result: unknown): FileRef | null => {
  try {
    const o = typeof result === "string" ? JSON.parse(result) : (result as any);
    if (o?.type === "file" && typeof o.name === "string") {
      return { name: o.name, mime: o.mime, size: o.size, url: o.url };
    }
  } catch {
    /* not JSON: an error message, for example */
  }
  return null;
};

/** Turns the thread's messages (and any open interrupt) into what the panel shows. */
export function buildRouteModel(
  messages: readonly any[],
  interrupt: { value?: any } | undefined,
  draft: Draft | null = null,
): RouteModel {
  let answers: Answer[] = [];
  let submitted = false;
  let path: RouteModel["path"] = null;
  let todos: { content?: string; status?: StepStatus }[] = [];
  const inputs: FileRef[] = [];
  const outputs: FileRef[] = [];
  const skills: SkillUse[] = [];
  const tools = new Map<string, ToolUse>();
  // Attribute each tool call to the step that was in progress when it ran.
  const stepActivity = new Map<number, Map<string, StepActivity>>();
  const stepFiles = new Map<number, FileRef[]>();
  let activeStep = -1;

  for (const message of messages) {
    if (message.role === "user") {
      for (const a of message.attachments ?? []) {
        if (!inputs.some((f) => f.name === a.name)) {
          inputs.push({ name: a.name, mime: a.contentType });
        }
      }
      continue;
    }
    if (message.role !== "assistant") continue;

    for (const part of message.content ?? []) {
      if (part.type !== "tool-call") continue;
      const args = part.args ?? {};
      const running = part.result === undefined;

      const use = tools.get(part.toolName) ?? {
        name: part.toolName,
        label: TOOL_LABELS[part.toolName] ?? part.toolName.replace(/__/g, ": ").replace(/_/g, " "),
        count: 0,
        running: false,
      };
      use.count += 1;
      use.running = use.running || running;
      tools.set(part.toolName, use);

      if (part.toolName === "read_file") {
        const m = asString(args.file_path ?? args.path).match(/\/skill_cache\/([^/]+)\/([^/]+)\/SKILL\.md$/i);
        if (m && !skills.some((k) => k.id === m[1])) skills.push({ id: m[1], label: skillLabel(m[1]), version: m[2] });
      }

      if (activeStep >= 0 && !FLOW_TOOLS.has(part.toolName)) {
        const byLabel = stepActivity.get(activeStep) ?? new Map<string, StepActivity>();
        const entry = byLabel.get(use.label) ?? { label: use.label, count: 0 };
        entry.count += 1;
        byLabel.set(use.label, entry);
        stepActivity.set(activeStep, byLabel);
      }

      if (part.toolName === "publish_file") {
        const f = parseFile(part.result);
        if (f && !outputs.some((o) => o.url === f.url)) outputs.push(f);
        if (f && activeStep >= 0) stepFiles.set(activeStep, [...(stepFiles.get(activeStep) ?? []), f]);
      }

      if (part.toolName === "collect_requirements" && part.result !== undefined) {
        const given = parseSubmitted(part.result);
        if (given) {
          answers = given.map(({ id, question, answer }) => ({ id, question, answer }));
          submitted = true;
        }
      }

      if (part.toolName === "recommend_path" && typeof args.path === "string") {
        // The result carries registry metadata (label, version, status, environment);
        // until it arrives, show what the model passed.
        const given = parsePath(part.result);
        path = {
          id: args.path,
          label: given?.label ?? skillLabel(args.path).replace(/ path$/, ""),
          blurb: given?.blurb ?? "",
          accent: given?.accent ?? "",
          version: given?.version,
          status: given?.status,
          env: given?.env,
          reason: asString(args.reason),
          requirements: Array.isArray(args.requirements)
            ? args.requirements.filter((r: unknown) => typeof r === "string")
            : [],
        };
      }

      if (part.toolName === "write_todos" && Array.isArray(args.todos)) {
        todos = args.todos;
        activeStep = todos.findIndex((t) => t.status === "in_progress");
      }
    }
  }

  const steps = todos
    .filter((t) => typeof t.content === "string")
    .map((t, i) => ({
      ...parseStep(t.content as string, i, t.status ?? "pending"),
      activity: [...(stepActivity.get(i)?.values() ?? [])],
      files: stepFiles.get(i) ?? [],
    }));

  // While the form is open, mirror the draft so the panel fills in as the person answers.
  let discovery: Discovery | null = null;
  const form = isFormInterrupt(interrupt?.value) ? interrupt!.value : null;
  if (form && !submitted) {
    const total = form.questions.length;
    const step = Math.min(draft?.step ?? 0, total);
    const live = { ...form.prefill, ...(draft?.answers ?? {}) };
    answers = form.questions
      .filter((q) => live[q.id]?.trim())
      .map((q) => ({ id: q.id, question: q.label, answer: live[q.id] }));
    discovery = { step: Math.min(step + 1, total), total, review: step >= total, submitted: false };
  } else if (submitted) {
    discovery = { step: answers.length, total: answers.length, review: false, submitted: true };
  }

  let stage: RouteModel["stage"] = "empty";
  if (steps.length) {
    stage = steps.every((s) => s.status === "completed") ? "done" : "planned";
  } else if (path) {
    stage = "planned";
  } else if (messages.length > 0 || discovery) {
    stage = "discovering";
  }

  return {
    stage,
    discovery,
    answers,
    path,
    steps,
    inputs,
    outputs,
    skills,
    tools: [...tools.values()],
  };
}

export function useRouteModel(): RouteModel {
  const messages = useAuiState((s) => s.thread.messages);
  const interrupt = useLangGraphInterruptState();
  const { draft } = useDraft();
  return useMemo(
    () => buildRouteModel(messages as readonly any[], interrupt, draft),
    [messages, interrupt, draft],
  );
}
