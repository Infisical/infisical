import { streamAgentChat, TAgentMessage, TAgentToolCall } from "@app/hooks/api/sandboxes";

/**
 * Conversation state held outside React, keyed by sandbox.
 *
 * The chat is a tab, so navigating to the terminal or the logs unmounts it. Held in component state
 * the history went with it, and worse, so did any reply still streaming. Keeping it here means the
 * turn keeps arriving while you are on another tab and is simply there when you come back.
 *
 * Deliberately in memory rather than in the database: it is a session's worth of conversation, not a
 * record, and a reload starting fresh is the expected behaviour.
 */

export type TChatTurn = TAgentMessage & { toolCalls?: TAgentToolCall[] };

type TChatState = {
  turns: TChatTurn[];
  isStreaming: boolean;
};

const EMPTY: TChatState = { turns: [], isStreaming: false };

const states = new Map<string, TChatState>();
const listeners = new Map<string, Set<() => void>>();
const controllers = new Map<string, AbortController>();

export const getChatState = (sandboxId: string): TChatState => states.get(sandboxId) ?? EMPTY;

export const subscribeToChat = (sandboxId: string, listener: () => void) => {
  const forSandbox = listeners.get(sandboxId) ?? new Set();
  forSandbox.add(listener);
  listeners.set(sandboxId, forSandbox);

  return () => {
    forSandbox.delete(listener);
  };
};

const update = (sandboxId: string, change: (state: TChatState) => TChatState) => {
  // A new object every time: useSyncExternalStore compares snapshots by identity, so mutating in
  // place would leave the component showing the previous turn.
  states.set(sandboxId, change(getChatState(sandboxId)));
  listeners.get(sandboxId)?.forEach((listener) => listener());
};

const patchLastTurn = (sandboxId: string, change: (turn: TChatTurn) => TChatTurn) =>
  update(sandboxId, (state) => ({
    ...state,
    turns: state.turns.map((turn, index) =>
      index === state.turns.length - 1 ? change(turn) : turn
    )
  }));

const resolveErrorMessage = (error: unknown) => {
  const serverMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  if (serverMessage) return serverMessage;
  return error instanceof Error ? error.message : "The agent could not respond.";
};

export const sendChatMessage = async (sandboxId: string, content: string) => {
  const { turns, isStreaming } = getChatState(sandboxId);
  if (isStreaming || !content) return;

  const history: TAgentMessage[] = [
    // Drop any empty turn: the API requires non-empty content, and a failed turn leaves one behind.
    ...turns
      .filter((turn) => turn.content.trim())
      .map(({ role, content: text }) => ({ role, content: text })),
    { role: "user" as const, content }
  ];

  // The assistant turn is appended empty and filled in as events arrive.
  update(sandboxId, (state) => ({
    turns: [...state.turns, { role: "user", content }, { role: "assistant", content: "" }],
    isStreaming: true
  }));

  const controller = new AbortController();
  controllers.set(sandboxId, controller);

  try {
    await streamAgentChat(
      sandboxId,
      history,
      (event) => {
        if (event.type === "text") {
          patchLastTurn(sandboxId, (turn) => ({ ...turn, content: turn.content + event.text }));
        } else if (event.type === "tool_start") {
          patchLastTurn(sandboxId, (turn) => ({
            ...turn,
            toolCalls: [
              ...(turn.toolCalls ?? []),
              {
                command: event.command,
                exitCode: null,
                output: "",
                kind: event.kind,
                target: event.target
              }
            ]
          }));
        } else if (event.type === "tool_end") {
          patchLastTurn(sandboxId, (turn) => ({
            ...turn,
            toolCalls: (turn.toolCalls ?? []).map((call, index, all) =>
              index === all.length - 1
                ? { ...call, exitCode: event.exitCode, output: event.output }
                : call
            )
          }));
        } else if (event.type === "done") {
          // A turn that streams no text (hitting the step limit, for one) carries its whole reply
          // here. Without this the turn renders empty and looks like it hung.
          patchLastTurn(sandboxId, (turn) => ({ ...turn, content: turn.content || event.reply }));
        } else if (event.type === "error") {
          patchLastTurn(sandboxId, (turn) => ({ ...turn, content: turn.content || event.message }));
        }
      },
      controller.signal
    );
  } catch (error) {
    patchLastTurn(sandboxId, (turn) => ({
      ...turn,
      content: turn.content || resolveErrorMessage(error)
    }));
  } finally {
    controllers.delete(sandboxId);
    update(sandboxId, (state) => ({ ...state, isStreaming: false }));
  }
};

/** Used when a sandbox is deleted, so its conversation does not outlive it. */
export const clearChat = (sandboxId: string) => {
  controllers.get(sandboxId)?.abort();
  controllers.delete(sandboxId);
  states.delete(sandboxId);
  listeners.get(sandboxId)?.forEach((listener) => listener());
};
