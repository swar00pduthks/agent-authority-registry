import type { RouteModel } from "./route";

/** Static states for previewing the panel without a backend: /?demo=empty|discover|plan|done */
const answers = [
  { id: "goal", question: "What should the AI do?", answer: "Automate a workflow" },
  { id: "audience", question: "Who will use it?", answer: "My team" },
  { id: "data", question: "What data will it use?", answer: "Internal" },
  { id: "systems", question: "What must it connect to?", answer: "One or two standard apps" },
  { id: "coding", question: "How comfortable are you with code?", answer: "Light scripting" },
  { id: "autonomy", question: "How much should it act on its own?", answer: "Suggest, I approve" },
  { id: "speed", question: "How fast do you need it?", answer: "Within a month" },
];

const steps = [
  "[You] Describe the workflow trigger and the systems it must touch",
  "[Agent] Sketch the workflow canvas: trigger, agent node, tool nodes, approval node",
  "[You] Create the connections and store credentials in the platform vault",
  "[Agent] Generate the node configuration and the prompt for the agent node",
  "[You] Add a custom expression or small script node where the logic needs it",
  "[Agent] Create 5 test cases covering the happy path and two failure modes",
  "[You] Run the test cases on the canvas and review the traces",
  "[Agent] Summarise the results and list what to fix before release",
  "[You] Promote the workflow to production",
];

const stepDetails: Record<number, Pick<RouteModel["steps"][number], "activity" | "files">> = {
  1: {
    activity: [
      { label: "Read a file", count: 1 },
      { label: "Write a file", count: 1 },
      { label: "Publish a file", count: 1 },
    ],
    files: [{ name: "workflow-canvas.md", mime: "text/markdown", size: 612, url: "/files/workflow-canvas.md" }],
  },
  3: {
    activity: [
      { label: "Write a file", count: 2 },
      { label: "Publish a file", count: 1 },
    ],
    files: [{ name: "node-config.json", mime: "application/json", size: 2210, url: "/files/node-config.json" }],
  },
};

const plan = (done: number): RouteModel["steps"] =>
  steps.map((raw, id) => ({
    id,
    owner: raw.startsWith("[You]") ? "you" : "agent",
    text: raw.replace(/^\[(You|Agent)\]\s*/, ""),
    status: id < done ? "completed" : id === done ? "in_progress" : "pending",
    activity: [],
    files: [],
    ...(id <= done ? stepDetails[id] : {}),
  }));

const path = {
  id: "low-code-path",
  label: "Low-code",
  blurb: "Workflow canvas with light scripting",
  accent: "low-code",
  version: "1.0.0",
  status: "approved",
  env: "prod",
  reason: "You need standard app connections and light scripting, with your team as the audience.",
  requirements: ["Workflow automation", "Team of about 20", "Internal data", "Two standard apps", "Human approval"],
};

const inputs = [
  { name: "ticket-triage-brief.pdf", mime: "application/pdf" },
  { name: "current-process.pptx", mime: "application/vnd.ms-powerpoint" },
];

const outputs = [
  { name: "workflow-canvas.md", mime: "text/markdown", size: 612, url: "/files/workflow-canvas.md" },
  { name: "test-cases.xlsx", mime: "application/vnd.ms-excel", size: 18432, url: "/files/test-cases.xlsx" },
];

const skills = [{ id: "low-code-path", label: "Low-code path", version: "1.0.0" }];

const tools = [
  { name: "collect_requirements", label: "Collect your requirements", count: 1, running: false },
  { name: "recommend_path", label: "Recommend a path", count: 1, running: false },
  { name: "read_file", label: "Read a file", count: 1, running: false },
  { name: "write_todos", label: "Plan the steps", count: 3, running: false },
  { name: "write_file", label: "Write a file", count: 2, running: false },
  { name: "publish_file", label: "Publish a file", count: 2, running: true },
];

const none = { inputs: [], outputs: [], skills: [], tools: [] };

export const FIXTURES: Record<string, RouteModel> = {
  empty: { stage: "empty", discovery: null, answers: [], path: null, steps: [], ...none },
  discover: {
    stage: "discovering",
    discovery: { step: 4, total: 7, review: false, submitted: false },
    answers: answers.slice(0, 3),
    path: null,
    steps: [],
    inputs: [inputs[0]],
    outputs: [],
    skills: [],
    tools: [],
  },
  plan: { stage: "planned", discovery: null, answers, path, steps: plan(4), inputs, outputs, skills, tools },
  done: {
    stage: "done",
    discovery: null,
    answers,
    path,
    steps: plan(steps.length),
    inputs,
    outputs,
    skills,
    tools: tools.map((t) => ({ ...t, running: false })),
  },
};
