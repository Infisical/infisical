import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Markdown from "react-markdown";
import { BotIcon, ChevronDownIcon, Loader2Icon, SendIcon, UserIcon } from "lucide-react";

import { IconButton, Input } from "@app/components/v3";
import { TAgentToolCall, TSandbox } from "@app/hooks/api/sandboxes";

import {
  getChatState,
  sendChatMessage,
  subscribeToChat,
  TChatTurn
} from "../../components/sandboxChatStore";
import { describeToolRun, TOOL_TONES, toToolKind } from "../../components/toolActivity";

/**
 * The agent answers in markdown, so tables, lists and code blocks are rendered rather than shown raw.
 * Styling is explicit per element because the app has no prose defaults.
 */
/** Concrete, and each one exercises a different granted resource. */
const STARTERS = [
  "What can you reach from here?",
  "How many users are in the database?",
  "List my GitHub repos"
];

const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 wrap-anywhere last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-project underline">
      {children}
    </a>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    // A language class marks a fenced block; anything else is inline.
    className ? (
      <code className="font-mono text-[11px]">{children}</code>
    ) : (
      <code className="rounded bg-container px-1 py-0.5 font-mono text-[11px] text-foreground">
        {children}
      </code>
    ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 thin-scrollbar overflow-x-auto rounded-md border border-border bg-bunker-800 p-2 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-2 thin-scrollbar overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-border px-2 py-1 text-left font-medium text-accent">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-border px-2 py-1">{children}</td>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 font-semibold text-foreground">{children}</p>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 font-semibold text-foreground">{children}</p>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 font-medium text-foreground">{children}</p>
  )
};

/**
 * Consecutive tool calls of the same kind, shown as one block.
 *
 * A reply can be a dozen commands, and listed raw they read as a wall of shell with no sense of what
 * the agent was actually doing. Grouped and coloured, the same run says "Accessing pg through PAM"
 * in database blue — the commands are still there, one click away, for anyone who wants them.
 */
const ToolGroup = ({ calls }: { calls: TAgentToolCall[] }) => {
  const kind = toToolKind(calls[0]?.kind);
  const tone = TOOL_TONES[kind];
  const Icon = tone.icon;

  const isRunning = calls.some((call) => call.exitCode === null);
  const failed = calls.filter((call) => call.exitCode !== null && call.exitCode !== 0).length;
  const target = calls.find((call) => call.target)?.target ?? null;

  return (
    <details className={`group/tool overflow-hidden rounded-md border ${tone.surface}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2">
        {isRunning ? (
          <Loader2Icon className={`size-3.5 shrink-0 animate-spin ${tone.text}`} />
        ) : (
          <Icon className={`size-3.5 shrink-0 ${tone.text}`} />
        )}

        <span className={`text-xs font-medium ${isRunning ? tone.text : "text-foreground"}`}>
          {describeToolRun(kind, target, !isRunning)}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {failed > 0 && <span className="font-mono text-[10px] text-danger">{failed} failed</span>}
          <span className="font-mono text-[10px] text-muted">
            {calls.length} {calls.length === 1 ? "step" : "steps"}
          </span>
          <ChevronDownIcon className="size-3 text-muted transition-transform group-open/tool:rotate-180" />
        </span>
      </summary>

      <div className="border-t border-border/50 px-2.5 py-2">
        {calls.map((call, index) => (
          // eslint-disable-next-line react/no-array-index-key -- commands repeat and are ordered
          <div key={index} className="flex gap-2 py-1">
            <span className={`shrink-0 font-mono text-[10px] leading-4 ${tone.text}`}>$</span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] leading-4 wrap-anywhere text-foreground">
                {call.command}
              </p>
              {Boolean(call.output) && (
                <pre className="mt-1 max-h-32 thin-scrollbar overflow-auto text-[10px] leading-4 whitespace-pre-wrap text-muted">
                  {call.output}
                </pre>
              )}
            </div>
            {call.exitCode !== null && call.exitCode !== 0 && (
              <span className="shrink-0 font-mono text-[10px] text-danger">
                exit {call.exitCode}
              </span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
};

/** Runs of the same kind collapse together; a change of kind starts a new block. */
const groupToolCalls = (calls: TAgentToolCall[]): TAgentToolCall[][] =>
  calls.reduce<TAgentToolCall[][]>((groups, call) => {
    const last = groups[groups.length - 1];
    if (last && toToolKind(last[0].kind) === toToolKind(call.kind)) {
      last.push(call);
      return groups;
    }
    return [...groups, [call]];
  }, []);

export const SandboxChat = ({ sandbox, isRunning }: { sandbox: TSandbox; isRunning: boolean }) => {
  // Subscribed rather than owned: the conversation lives outside React so switching tabs neither
  // loses the history nor kills a reply that is still streaming.
  const { turns, isStreaming } = useSyncExternalStore(
    (listener) => subscribeToChat(sandbox.id, listener),
    () => getChatState(sandbox.id)
  );
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, isStreaming]);

  const send = () => {
    const content = draft.trim();
    if (!content) return;

    setDraft("");
    sendChatMessage(sandbox.id, content).catch(() => {});
  };

  const placeholder = (() => {
    if (!isRunning) return "Start the sandbox to chat";
    if (!sandbox.agentType) return "Configure an agent first";
    return "Ask the agent to do something...";
  })();

  const isDisabled = !isRunning || !sandbox.agentType || isStreaming;

  // Focus on arrival and again when a turn finishes. Keyed on isDisabled rather than done by hand
  // after send, because the input is disabled while the agent streams and focusing a disabled
  // element silently does nothing.
  useEffect(() => {
    if (!isDisabled) inputRef.current?.focus();
  }, [isDisabled]);

  return (
    // Sized to match the terminal exactly: both sit under the same card chrome, so the offset that
    // covers the org header, the page title and that chrome is the same for each.
    <div className="flex h-[calc(100vh-24rem)] min-h-[320px] flex-col rounded-md border border-border bg-bunker-800">
      <div ref={scrollRef} className="thin-scrollbar flex-1 space-y-2.5 overflow-y-auto p-3">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full border border-product-sandbox/25 bg-gradient-to-br from-product-sandbox/15 to-transparent">
              <BotIcon className="size-5 sandbox-chrome-icon" />
            </span>

            {sandbox.agentType ? (
              <>
                <p className="text-sm text-muted">Try one of these to see it work.</p>
                {/* Starters rather than a description: an empty chat should show what it can do,
                    not restate the panel subtitle directly above it. */}
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => sendChatMessage(sandbox.id, starter).catch(() => {})}
                      className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-xs text-accent transition-colors hover:border-product-sandbox/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                No agent configured yet. Add one under Settings to start chatting.
              </p>
            )}
          </div>
        )}

        {turns.map((turn: TChatTurn, index: number) => (
          // eslint-disable-next-line react/no-array-index-key -- chat turns are append-only
          <div key={index} className="flex gap-2">
            <div className="mt-0.5 shrink-0">
              {turn.role === "user" ? (
                <UserIcon className="size-4 text-muted" />
              ) : (
                <BotIcon className="size-4 text-project" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {Boolean(turn.toolCalls?.length) && (
                <div className="flex flex-col gap-1.5">
                  {groupToolCalls(turn.toolCalls ?? []).map((group, groupIndex) => (
                    // eslint-disable-next-line react/no-array-index-key -- groups repeat and are ordered
                    <ToolGroup key={groupIndex} calls={group} />
                  ))}
                </div>
              )}

              {turn.role === "assistant" ? (
                Boolean(turn.content) && (
                  <div className="text-sm text-foreground">
                    <Markdown components={MARKDOWN_COMPONENTS}>{turn.content}</Markdown>
                  </div>
                )
              ) : (
                <p className="text-sm wrap-anywhere whitespace-pre-wrap text-foreground">
                  {turn.content}
                </p>
              )}

              {/* Inside the turn, so the bot icon is not drawn a second time. The running
                  command already shows its own spinner. */}
              {isStreaming &&
                index === turns.length - 1 &&
                !turn.content &&
                !turn.toolCalls?.length && <span className="text-xs text-muted">Working...</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-2">
        {/* Send sits inside the field rather than beside it: a detached button reads as unrelated
            chrome, and the pair never lines up at every width. */}
        <div className="relative">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            disabled={isDisabled}
            className="pr-11"
          />
          <IconButton
            variant="ghost"
            size="xs"
            aria-label="Send message"
            onClick={send}
            isDisabled={isDisabled || !draft.trim()}
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
          >
            <SendIcon className="size-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
};
