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

export enum SandboxActivityType {
  Command = "command",
  Proxy = "proxy"
}

export type TSandboxCommandEntry = {
  type: SandboxActivityType.Command;
  id: string;
  at: string;
  source: SandboxCommandSource;
  kind: SandboxCommandKind;
  command: string;
  exitCode: number | null;
  durationMs: number;
  /** What earned the classification: the PAM account, or the host that matched. */
  target: string | null;
  /** Set for PAM only, so the UI can show the resource's own logo and link to the account. */
  accountId: string | null;
  resourceType: string | null;
};

/**
 * One request the broker handled. This is the detail a command line cannot carry: which host was
 * actually reached, whether it was allowed, and which secret was attached on the way out.
 */
export type TSandboxProxyEntry = {
  type: SandboxActivityType.Proxy;
  id: string;
  at: string;
  decision: string;
  method: string;
  host: string;
  path: string;
  status?: number;
  integration?: string;
  credential?: string;
};

export type TSandboxActivityEntry = TSandboxCommandEntry | TSandboxProxyEntry;

type TCommandContext = {
  pamProxies: TPamProxy[];
  hostnames: string[];
  /**
   * CLIs a granted integration installs, and the host they stand for.
   *
   * A CLI hides the host it talks to: `gh api /repos/owner/name` never contains api.github.com, so
   * matching on hostname alone filed every gh call as plain shell while the broker's own record of
   * the same request showed the credential being swapped. The binary is the signal in that case.
   */
  clis: { binary: string; target: string }[];
};

type TCommandLogState = {
  entries: TSandboxActivityEntry[];
  context: TCommandContext;
  subscribers: Set<(entry: TSandboxActivityEntry) => void>;
};

const MAX_ENTRIES = 500;
const states = new Map<string, TCommandLogState>();

const stateFor = (sandboxId: string): TCommandLogState => {
  const existing = states.get(sandboxId);
  if (existing) return existing;

  const created: TCommandLogState = {
    entries: [],
    context: { pamProxies: [], hostnames: [], clis: [] },
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

const classify = (
  command: string,
  context: TCommandContext
): Pick<TSandboxCommandEntry, "kind" | "target" | "accountId" | "resourceType"> => {
  // A PAM account is only ever reachable as a port on loopback, so the port is the whole signal.
  const pamProxy = context.pamProxies.find(
    (proxy) => command.includes(`:${proxy.port}`) || command.includes(`-p ${proxy.port}`)
  );
  if (pamProxy) {
    return {
      kind: SandboxCommandKind.Pam,
      target: pamProxy.accountName,
      accountId: pamProxy.accountId,
      resourceType: pamProxy.resourceType ?? null
    };
  }

  const host = context.hostnames.find((hostname) => command.includes(hostname.replace("*.", "")));
  if (host) {
    return { kind: SandboxCommandKind.Integration, target: host, accountId: null, resourceType: null };
  }

  // Anchored to a command position: start of the line, or after a pipe, semicolon or &&. Matching
  // the bare word anywhere would file `cd gh-pages` as a GitHub call.
  const cli = context.clis.find((entry) => new RegExp(String.raw`(^|[|;&]\s*|\n\s*)${entry.binary}\b`).test(command));
  if (cli) {
    return {
      kind: SandboxCommandKind.Integration,
      target: cli.target,
      accountId: null,
      resourceType: null
    };
  }

  return { kind: SandboxCommandKind.Shell, target: null, accountId: null, resourceType: null };
};

const $append = (state: TCommandLogState, recorded: TSandboxActivityEntry) => {
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

/**
 * How a command would be classified, without recording it. The agent loop uses this to label a tool
 * call as it starts, so the chat can say "Querying pg" instead of showing raw psql plumbing, using
 * exactly the same rules the activity log uses rather than a second set of guesses in the frontend.
 */
export const classifySandboxCommand = (sandboxId: string, command: string) =>
  classify(command, stateFor(sandboxId).context);

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
    type: SandboxActivityType.Command,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...classify(entry.command, state.context),
    ...entry
  };

  $append(state, recorded);
};

/** Called by the broker for every request it handles, so both streams share one timeline. */
export const recordSandboxProxyEvent = (sandboxId: string, entry: Omit<TSandboxProxyEntry, "type" | "id">) => {
  const state = stateFor(sandboxId);
  $append(state, { type: SandboxActivityType.Proxy, id: crypto.randomUUID(), ...entry });
};

export const getSandboxCommandLog = (sandboxId: string): TSandboxActivityEntry[] => [
  ...(states.get(sandboxId)?.entries ?? [])
];

/** Returns an unsubscribe, which the route must call so a closed connection frees its listener. */
export const subscribeToSandboxCommands = (sandboxId: string, onEntry: (entry: TSandboxActivityEntry) => void) => {
  const state = stateFor(sandboxId);
  state.subscribers.add(onEntry);
  return () => state.subscribers.delete(onEntry);
};
