import { AuiIf, ThreadPrimitive } from "@assistant-ui/react";
import { Composer } from "./Composer";
import { AssistantMessage, UserMessage } from "./Messages";
import { Welcome } from "./Welcome";

export function Chat() {
  return (
    <ThreadPrimitive.Root className="thread">
      <ThreadPrimitive.Viewport className="viewport">
        <div className="thread-inner">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <Welcome />
          </AuiIf>
          <ThreadPrimitive.Messages>
            {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}
          </ThreadPrimitive.Messages>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <p className="working" role="status">
              <i /><i /><i />
              <span className="sr-only">The agent is working</span>
            </p>
          </AuiIf>
        </div>
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}
