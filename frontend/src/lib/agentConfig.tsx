import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { AskUserCard } from "../components/chat/AskUserCard";
import { RequirementsToolUI } from "../components/requirements/RequirementsToolUI";

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

const Ctx = createContext<AgentConfig>({ env: "local", revision: null, ui: DEFAULT_UI });
export const useAgentConfig = () => useContext(Ctx);

/** Loads the UI mapping from the server (which holds the registry token) and refreshes it when the tab regains focus. */
export function AgentConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AgentConfig>({ env: "local", revision: null, ui: DEFAULT_UI });

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/agent-config")
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((c: AgentConfig) => live && setConfig(c))
        .catch(() => undefined);
    load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
  }, []);

  return <Ctx.Provider value={useMemo(() => config, [config])}>{children}</Ctx.Provider>;
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
