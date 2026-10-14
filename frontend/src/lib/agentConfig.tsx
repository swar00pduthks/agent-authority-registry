import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuiState, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { AskUserCard } from "../components/chat/AskUserCard";
import { RequirementsToolUI } from "../components/requirements/RequirementsToolUI";
import { loadThreadConfig } from "./langgraph";

/** Components this build ships. The registry chooses which tool uses which, and which version. */
const quiet: ToolCallMessagePartComponent = () => null;
export const COMPONENTS: Record<string, ToolCallMessagePartComponent> = {
  "requirements-stepper": RequirementsToolUI,
  "ask-user-card": AskUserCard,
  hidden: quiet,
};

/** Used when the registry cannot be reached, so the app still works. */
const DEFAULT_UI: AgentConfig["ui"] = {
  collect_requirements: { component: "requirements-stepper", version: "built-in" },
  ask_user: { component: "ask-user-card", version: "built-in" },
  write_todos: { component: "hidden", version: "built-in" },
  recommend_path: { component: "hidden", version: "built-in" },
};

export type AgentConfig = {
  env: string;
  revision: number | null;
  ui: Record<string, { component: string; version: string }>;
};

const LOCAL_CONFIG: AgentConfig = { env: "local", revision: null, ui: DEFAULT_UI };
const Ctx = createContext<AgentConfig>(LOCAL_CONFIG);
export const useAgentConfig = () => useContext(Ctx);

/** Loads the UI mapping from the active conversation's pinned registry snapshot. */
export function AgentConfigProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<{ threadId: string; config: AgentConfig } | null>(null);
  const threadId = useAuiState((s) => s.threadListItem.externalId);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  useEffect(() => {
    let live = true;
    if (!threadId) {
      return () => {
        live = false;
      };
    }
    loadThreadConfig(threadId)
      .then((config) => config && live && setLoaded({ threadId, config }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [threadId, isRunning]);

  const config =
    threadId && loaded?.threadId === threadId
      ? loaded.config
      : LOCAL_CONFIG;
  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}

/** tools.by_name for assistant-ui, built from the registry's mapping. Unknown components are ignored, not crashed on. */
export function useToolComponents(): Record<string, ToolCallMessagePartComponent> {
  const { ui } = useAgentConfig();
  return useMemo(() => {
    const out: Record<string, ToolCallMessagePartComponent> = {};
    for (const [tool, { component }] of Object.entries(ui)) {
      if (COMPONENTS[component]) out[tool] = COMPONENTS[component];
    }
    return out;
  }, [ui]);
}
