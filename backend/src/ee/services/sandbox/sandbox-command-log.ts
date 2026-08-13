import crypto from "node:crypto";

import { TPamProxy } from "./sandbox-pam-runtime";

/**
 * Every command a sandbox runs, whoever asked for it. `execInSandbox` is the only way anything
 * executes in a sandbox, so recording there is what makes this complete rather than a best effort:
 * the agent's tool calls, the terminal, and the Slack plumbing all funnel through it.
 *
 * Held in memory for the life of the run, like the proxy log. It is a live view of one sandbox, not
 * the org's audit trail, and it goes when the sandbox does.
 */

export enum SandboxCommandKind {
  /** Reached a PAM account through its brokered localhost port. */
  Pam = "pam",
  /** Reached a host a granted integration covers, so the proxy attached a credential. */
  Integration = "integration",
  /** Everything else: ordinary work in the sandbox that touched nothing granted. */
  Shell = "shell"
}

export enum SandboxCommandSource {
  Agent = "agent",
  Terminal = "terminal",
  Slack = "slack"
}

export type TSandboxCommandEntry = {
  id: string;
  at: string;
  source: SandboxCommandSource;
  kind: SandboxCommandKind;
  command: string;
  exitCode: number | null;
  durationMs: number;
  /** What earned the classification: the PAM account, or the host that matched. */
  target: string | null;
};

type TCommandContext = {
  pamProxies: TPamProxy[];
  hostnames: string[];
};

type TCommandLogState = {
  entries: TSandboxCommandEntry[];
  context: TCommandContext;
  subscribers: Set<(entry: TSandboxCommandEntry) => void>;
};

const MAX_ENTRIES = 500;
const states = new Map<string, TCommandLogState>();

const stateFor = (sandboxId: string): TCommandLogState => {
  const existing = states.get(sandboxId);
  if (existing) return existing;

  const created: TCommandLogState = {
    entries: [],
    context: { pamProxies: [], hostnames: [] },
    subscribers: new Set()
  };
  states.set(sandboxId, created);
  return created;
};

/**
 * What the sandbox can currently reach, so a command can be classified as it is recorded rather
 * than guessed at read time. Set when the sandbox starts, since both lists are decided there.
 */
export const setSandboxCommandContext = (sandboxId: string, context: TCommandContext) => {
  stateFor(sandboxId).context = context;
};

export const clearSandboxCommandLog = (sandboxId: string) => {
  states.delete(sandboxId);
};

const classify = (command: string, context: TCommandContext): Pick<TSandboxCommandEntry, "kind" | "target"> => {
  // A PAM account is only ever reachable as a port on loopback, so the port is the whole signal.
  const pamProxy = context.pamProxies.find(
    (proxy) => command.includes(`:${proxy.port}`) || command.includes(`-p ${proxy.port}`)
  );
  if (pamProxy) {
    return { kind: SandboxCommandKind.Pam, target: `${pamProxy.accountName} on ${pamProxy.resourceName}` };
  }

  const host = context.hostnames.find((hostname) => command.includes(hostname.replace("*.", "")));
  if (host) return { kind: SandboxCommandKind.Integration, target: host };

  return { kind: SandboxCommandKind.Shell, target: null };
};

export const recordSandboxCommand = (
  sandboxId: string,
  entry: {
    source: SandboxCommandSource;
    command: string;
    exitCode: number | null;
    durationMs: number;
  }
) => {
  const state = stateFor(sandboxId);

  const recorded: TSandboxCommandEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...classify(entry.command, state.context),
    ...entry
  };

  state.entries.push(recorded);
  if (state.entries.length > MAX_ENTRIES) state.entries.shift();

  // A slow or broken subscriber must not take down the command that is being recorded.
  state.subscribers.forEach((notify) => {
    try {
      notify(recorded);
    } catch {
      state.subscribers.delete(notify);
    }
  });
};

export const getSandboxCommandLog = (sandboxId: string): TSandboxCommandEntry[] => [
  ...(states.get(sandboxId)?.entries ?? [])
];

/** Returns an unsubscribe, which the route must call so a closed connection frees its listener. */
export const subscribeToSandboxCommands = (sandboxId: string, onEntry: (entry: TSandboxCommandEntry) => void) => {
  const state = stateFor(sandboxId);
  state.subscribers.add(onEntry);
  return () => state.subscribers.delete(onEntry);
};
