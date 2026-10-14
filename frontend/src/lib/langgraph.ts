import { Client } from "@langchain/langgraph-sdk";
import type {
  LangChainMessage,
  LangGraphInterruptState,
  LangGraphStreamCallback,
} from "@assistant-ui/react-langgraph";

const apiUrl =
  import.meta.env.VITE_LANGGRAPH_URL ?? `${window.location.origin}/api`;
const assistantId: string = import.meta.env.VITE_ASSISTANT_ID ?? "agent";

export const client = new Client({ apiUrl });

/** Published files are served by backend/webapp.py at /files. */
export const fileUrl = (path: string) =>
  /^https?:/.test(path) ? path : `${apiUrl}${path}`;

/**
 * Streams one run. `messages-tuple` carries token-by-token output, `updates`
 * carries interrupts, and `values` carries the full graph state.
 * When the runtime resumes after an interrupt it passes `config.command`.
 */
export const stream: LangGraphStreamCallback<LangChainMessage> = async (
  messages,
  config,
) => {
  const { externalId } = await config.initialize();
  if (!externalId) throw new Error("Thread was not created on the server.");

  return client.runs.stream(externalId, assistantId, {
    input: config.command ? undefined : { messages },
    command: config.command ? { resume: config.command.resume } : undefined,
    // `updates` is what carries the interrupt raised by ask_user.
    streamMode: ["messages-tuple", "updates", "values"],
    signal: config.abortSignal,
  }) as ReturnType<LangGraphStreamCallback<LangChainMessage>>;
};

export const create = async () => {
  const { thread_id } = await client.threads.create();
  return { externalId: thread_id };
};

/** Restores messages and any pending question when the page reloads. */
export const load = async (threadId: string) => {
  const state = await client.threads.getState(threadId);
  const values = state.values as { messages?: LangChainMessage[] };
  const interrupts = (state.tasks ?? []).flatMap(
    (task) => task.interrupts ?? [],
  ) as LangGraphInterruptState[];
  return { messages: values.messages ?? [], interrupts };
};
