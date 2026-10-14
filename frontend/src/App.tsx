import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AssistantRuntimeProvider, useAui } from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import AdminApp from "./admin/AdminApp";
import { AgentConfigProvider, useAgentConfig } from "./lib/agentConfig";
import { Chat } from "./components/chat/Chat";
import { DraftProvider } from "./components/requirements/DraftContext";
import { RoutePanel } from "./components/panel/RoutePanel";
import { FIXTURES } from "./lib/fixtures";
import { accentVar, useRouteModel } from "./lib/route";
import { fileAttachmentAdapter } from "./lib/attachments";
import { create, load, stream } from "./lib/langgraph";

function Shell() {
  const aui = useAui();
  const config = useAgentConfig();
  const model = useRouteModel();
  const [open, setOpen] = useState(false);
  const routeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = routeButton.current;
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  const total = model.steps.length;
  const done = model.steps.filter((s) => s.status === "completed").length;
  const d = model.discovery;
  const pill =
    model.stage === "planned" || model.stage === "done"
      ? `${done}/${total}`
      : d && !d.submitted
        ? d.review
          ? "review"
          : `${d.step}/${d.total}`
        : null;

  return (
    <div className="app" style={{ "--line": accentVar(model.path?.accent) } as CSSProperties}>
      <main className="chat" inert={open}>
        <header className="chat-head">
          <span className="brand">AI Platform Guide</span>
          {config.revision != null && <span className="env-tag" title="Agent configuration from the registry">{config.env} · rev {config.revision}</span>}
          {model.path && <span className="path-tag">{model.path.label}</span>}
          <button ref={routeButton} className="route-pill" onClick={() => setOpen(true)} aria-haspopup="dialog">
            Route{pill ? ` ${pill}` : ""}
          </button>
        </header>
        <Chat />
      </main>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside
        ref={panel}
        className="panel"
        data-open={open || undefined}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label="Your route"
        tabIndex={open ? -1 : undefined}
      >
        <RoutePanel
          model={model}
          onClose={() => setOpen(false)}
          onRestart={() => {
            setOpen(false);
            void aui.threads().switchToNewThread();
          }}
        />
      </aside>
    </div>
  );
}

function Live() {
  const runtime = useLangGraphRuntime({
    stream,
    create,
    load,
    adapters: { attachments: fileAttachmentAdapter },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AgentConfigProvider>
        <DraftProvider>
          <Shell />
        </DraftProvider>
      </AgentConfigProvider>
    </AssistantRuntimeProvider>
  );
}

/** /?demo=empty|discover|plan|done shows the panel with static data. */
function Demo({ name }: { name: string }) {
  const model = FIXTURES[name] ?? FIXTURES.plan;
  return (
    <div className="app" style={{ "--line": accentVar(model.path?.accent) } as CSSProperties}>
      <main className="chat demo-chat">
        <p className="demo-note">Panel preview: {name}</p>
      </main>
      <aside className="panel">
        <RoutePanel model={model} onRestart={() => {}} />
      </aside>
    </div>
  );
}

export default function App() {
  if (window.location.pathname.startsWith("/admin")) return <AdminApp />;
  const demo = new URLSearchParams(window.location.search).get("demo");
  return demo ? <Demo name={demo} /> : <Live />;
}
