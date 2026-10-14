import { AttachmentPrimitive, ComposerPrimitive } from "@assistant-ui/react";
import { useLangGraphInterruptState } from "@assistant-ui/react-langgraph";
import { isFormInterrupt } from "../../lib/requirements";
import { PaperIcon } from "./Messages";

const PendingAttachment = () => (
  <AttachmentPrimitive.Root className="att">
    <PaperIcon />
    <AttachmentPrimitive.Name />
    <AttachmentPrimitive.Remove className="att-x" aria-label="Remove file">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </AttachmentPrimitive.Remove>
  </AttachmentPrimitive.Root>
);

/** Locked while the agent waits on the form or a question, so the thread cannot fork. */
export function Composer() {
  const interrupt = useLangGraphInterruptState();
  const waiting = !!interrupt;
  const placeholder = !waiting
    ? "Describe what you want to build, or attach files"
    : isFormInterrupt(interrupt?.value)
      ? "Finish the form above to continue"
      : "Choose an answer above to continue";

  return (
    <ComposerPrimitive.Root className="composer">
      <ComposerPrimitive.AttachmentDropzone className="composer-box">
        <div className="atts atts-pending">
          <ComposerPrimitive.Attachments components={{ Attachment: PendingAttachment }} />
        </div>
        <div className="composer-row">
          <ComposerPrimitive.AddAttachment className="attach" aria-label="Attach files" disabled={waiting}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M13 7.5l-4.9 4.9a3 3 0 01-4.2-4.2l5.2-5.2a2 2 0 112.8 2.8L6.7 11a1 1 0 01-1.4-1.4l4.4-4.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ComposerPrimitive.AddAttachment>
          <ComposerPrimitive.Input className="composer-input" rows={1} disabled={waiting} placeholder={placeholder} aria-label="Message" />
          <ComposerPrimitive.Send className="send" aria-label="Send message">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M8 13V3m0 0L3.5 7.5M8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
}
