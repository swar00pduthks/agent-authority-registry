import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Draft } from "../../lib/requirements";

type Value = { draft: Draft | null; setDraft: (d: Draft | null) => void };

const DraftContext = createContext<Value>({ draft: null, setDraft: () => {} });

/**
 * Lets the form (in the chat) and the route panel share what is typed before
 * anything is submitted. The thread only knows about answers after submit.
 */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const value = useMemo(() => ({ draft, setDraft }), [draft]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export const useDraft = () => useContext(DraftContext);
