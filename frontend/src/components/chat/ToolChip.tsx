import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

const LABELS: Record<string, [string, string]> = {
  read_file: ["Reading", "Read"],
  ls: ["Looking through", "Looked through"],
  glob: ["Searching", "Searched"],
  grep: ["Searching", "Searched"],
  write_file: ["Writing", "Wrote"],
  publish_file: ["Publishing", "Published"],
  edit_file: ["Editing", "Edited"],
  task: ["Delegating", "Delegated"],
  load_tool: ["Loading", "Loaded"],
};

const target = (args: any): string => {
  const p = args?.file_path ?? args?.path ?? args?.pattern ?? "";
  if (typeof p !== "string" || !p) return "";
  const last = p.split("/").filter(Boolean).pop() ?? p;
  return last.toLowerCase() === "skill.md"
    ? (p.split("/").filter(Boolean).slice(-2, -1)[0] ?? last).replace(/-/g, " ") + " guide"
    : last;
};

/** Compact activity line for tools that have no dedicated UI. */
export const ToolChip: ToolCallMessagePartComponent = ({ toolName, args, result, isError }) => {
  const done = result !== undefined;
  const [doing, did] = LABELS[toolName] ?? ["Running", "Ran"];
  const name = LABELS[toolName] ? target(args) : toolName.replace(/__/g, ": ").replace(/_/g, " ");
  return (
    <p className="chip" data-done={done || undefined} data-error={isError || undefined}>
      <span className="chip-dot" aria-hidden="true" />
      {done ? did : doing} {name}
    </p>
  );
};
