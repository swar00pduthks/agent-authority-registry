import { useEffect, useState } from "react";
import { ActivityTab } from "./ActivityTab";
import { AgentsTab } from "./AgentsTab";
import { SkillsTab } from "./SkillsTab";
import { ToolsTab } from "./ToolsTab";
import { api, setToken } from "./api";
import { Who } from "./ui";
import "./admin.css";

const TABS = ["Agents", "Skills", "Tools and UI", "Activity"] as const;
type Tab = (typeof TABS)[number];

function Login({ onDone }: { onDone: () => void }) {
  const [token, setT] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="adm-login">
      <h1>Registry console</h1>
      <p>Paste your registry token. It stays in this tab only.</p>
      <form onSubmit={(e) => { e.preventDefault(); setToken(token.trim()); api("/v1/me").then(onDone).catch(() => { setToken(""); setError("That token was not accepted."); }); }}>
        <input type="password" value={token} onChange={(e) => setT(e.target.value)} aria-label="Registry token" autoFocus />
        <button className="btn-primary" type="submit">Sign in</button>
      </form>
      {error && <p className="notice" data-ok="false" role="alert">{error}</p>}
    </main>
  );
}

export default function AdminApp() {
  const [who, setWho] = useState<{ name: string; roles: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("Agents");

  const check = () => api<{ name: string; roles: string }>("/v1/me").then(setWho).catch(() => setWho(null)).finally(() => setChecked(true));
  useEffect(() => { void check(); }, []);

  if (!checked) return null;
  if (!who) return <Login onDone={() => void check()} />;
  return (
    <Who.Provider value={who}>
    <div className="adm">
      <header className="adm-head">
        <h1>Registry console</h1>
        <nav aria-label="Sections">
          {TABS.map((t) => <button key={t} className="adm-tab" aria-current={t === tab || undefined} onClick={() => setTab(t)}>{t}</button>)}
        </nav>
        <span className="adm-who">{who.name} · {who.roles}<button className="link" onClick={() => { setToken(""); setWho(null); }}>Sign out</button></span>
      </header>
      <main className="adm-main">
        {tab === "Agents" && <AgentsTab />}
        {tab === "Skills" && <SkillsTab />}
        {tab === "Tools and UI" && <ToolsTab />}
        {tab === "Activity" && <ActivityTab />}
      </main>
    </div>
    </Who.Provider>
  );
}
