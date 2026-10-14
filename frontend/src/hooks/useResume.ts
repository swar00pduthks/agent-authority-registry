import { useCallback, useState } from "react";
import { useLangGraphSendCommand } from "@assistant-ui/react-langgraph";

/** Resumes the paused graph with a string value and tracks the in-flight state. */
export function useResume() {
  const sendCommand = useLangGraphSendCommand();
  const [busy, setBusy] = useState(false);

  const resume = useCallback(
    async (value: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await sendCommand({ resume: value });
      } finally {
        setBusy(false);
      }
    },
    [busy, sendCommand],
  );

  return { resume, busy };
}
