import { AttachmentPrimitive, MessagePrimitive, type ReasoningMessagePartComponent } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { useToolComponents } from "../../lib/agentConfig";
import { ToolChip } from "./ToolChip";

const Thinking: ReasoningMessagePartComponent = ({ text }) => (
  <details className="thinking">
    <summary>Thinking</summary>
    <p>{text}</p>
  </details>
);

const Markdown = () => <MarkdownTextPrimitive className="md" />;

export const PaperIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M4 1.5h5l3 3v10H4z M9 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

/** File chip on a sent message. */
const SentAttachment = () => (
  <AttachmentPrimitive.Root className="att">
    <PaperIcon />
    <AttachmentPrimitive.Name />
  </AttachmentPrimitive.Root>
);

export const UserMessage = () => (
  <MessagePrimitive.Root className="msg msg-user">
    <div className="atts">
      <MessagePrimitive.Attachments components={{ Attachment: SentAttachment }} />
    </div>
    <div className="bubble">
      <MessagePrimitive.Parts />
    </div>
  </MessagePrimitive.Root>
);

/**
 * Tool calls are routed by name, and the registry decides which component renders
 * each tool (and can hide one). Any tool it does not name gets a one-line chip.
 */
export const AssistantMessage = () => {
  const byName = useToolComponents();
  return (
    <MessagePrimitive.Root className="msg msg-assistant">
      <MessagePrimitive.Parts
        components={{ Text: Markdown, Reasoning: Thinking, tools: { by_name: byName, Fallback: ToolChip } }}
      />
    </MessagePrimitive.Root>
  );
};
