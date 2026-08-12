import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { BotIcon, SendIcon, UserIcon } from "lucide-react";

import { Button, Input } from "@app/components/v3";
import {
  TAgentMessage,
  TAgentToolCall,
  TSandbox,
  useChatWithAgent
} from "@app/hooks/api/sandboxes";

type TTurn = TAgentMessage & { toolCalls?: TAgentToolCall[] };

/**
 * The agent answers in markdown, so tables, lists and code blocks are rendered rather than shown raw.
 * Styling is explicit per element because the app has no prose defaults.
 */
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

const resolveErrorMessage = (error: unknown) => {
  const serverMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  if (serverMessage) return serverMessage;
  return error instanceof Error ? error.message : "The agent could not respond.";
};

/** One line per command, like a shell transcript. Output is behind the disclosure. */
const ToolCall = ({ call }: { call: TAgentToolCall }) => (
  <details className="group/tool">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded px-1 py-px hover:bg-foreground/5">
      <span className="shrink-0 font-mono text-[10px] text-muted">$</span>
      <span className="truncate font-mono text-[11px] leading-4 text-muted group-open/tool:text-foreground">
        {call.command}
      </span>
      {call.exitCode !== 0 && (
        <span className="shrink-0 font-mono text-[10px] text-danger">{call.exitCode ?? "err"}</span>
      )}
    </summary>
    <pre className="mt-1 mb-1 max-h-40 thin-scrollbar overflow-auto border-l border-border py-0.5 pl-2 text-[10px] leading-4 whitespace-pre-wrap text-muted">
      {call.output || "(no output)"}
    </pre>
  </details>
);

export const SandboxChat = ({ sandbox, isRunning }: { sandbox: TSandbox; isRunning: boolean }) => {
  const chat = useChatWithAgent();
  const [turns, setTurns] = useState<TTurn[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, chat.isPending]);

  const send = async () => {
    const content = draft.trim();
    if (!content) return;

    const history: TAgentMessage[] = [
      ...turns.map(({ role, content: text }) => ({ role, content: text })),
      { role: "user" as const, content }
    ];

    setTurns((prev) => [...prev, { role: "user", content }]);
    setDraft("");

    try {
      const turn = await chat.mutateAsync({ sandboxId: sandbox.id, messages: history });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: turn.reply, toolCalls: turn.toolCalls }
      ]);
    } catch (error) {
      setTurns((prev) => [...prev, { role: "assistant", content: resolveErrorMessage(error) }]);
    }
  };

  const placeholder = (() => {
    if (!isRunning) return "Start the sandbox to chat";
    if (!sandbox.agentType) return "Configure an agent first";
    return "Ask the agent to do something...";
  })();

  const isDisabled = !isRunning || !sandbox.agentType || chat.isPending;

  return (
    <div className="flex h-[420px] flex-col rounded-md border border-border bg-bunker-800">
      <div ref={scrollRef} className="thin-scrollbar flex-1 space-y-2.5 overflow-y-auto p-3">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <BotIcon className="size-6 text-muted" />
            <p className="text-xs text-muted">
              {sandbox.agentType
                ? "The agent can use every CLI and database granted to this sandbox."
                : "No agent configured yet."}
            </p>
          </div>
        )}

        {turns.map((turn, index) => (
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
              {turn.role === "assistant" ? (
                <div className="text-sm text-foreground">
                  <Markdown components={MARKDOWN_COMPONENTS}>{turn.content}</Markdown>
                </div>
              ) : (
                <p className="text-sm wrap-anywhere whitespace-pre-wrap text-foreground">
                  {turn.content}
                </p>
              )}
              {Boolean(turn.toolCalls?.length) && (
                <div className="rounded border border-border bg-bunker-800 px-1 py-1">
                  {turn.toolCalls?.map((call, callIndex) => (
                    // eslint-disable-next-line react/no-array-index-key -- commands repeat and are ordered
                    <ToolCall key={callIndex} call={call} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {chat.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <BotIcon className="size-4 animate-pulse text-project" />
            Working...
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-border p-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send().catch(() => {});
            }
          }}
          placeholder={placeholder}
          disabled={isDisabled}
        />
        <Button
          variant="project"
          onClick={() => send().catch(() => {})}
          isDisabled={isDisabled || !draft.trim()}
        >
          <SendIcon />
        </Button>
      </div>
    </div>
  );
};
