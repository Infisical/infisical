import { V4_CONNECTION_REDIRECT_STORAGE_KEY } from "@app/helpers/appConnections";
import type {
  AppConnectionRedirect,
  PendingConnectionRedirect
} from "@app/pages/v4/components/app-connection-form";

/** What the v4 flows store beside the shell's record: the gateway, and the connection a reconnect updates. */
export type ConnectionRedirectExtras = {
  connectionId?: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

export type V4PendingConnectionRedirect = PendingConnectionRedirect & ConnectionRedirectExtras;

export type TakenConnectionRedirect =
  | { status: "ok"; pending: V4PendingConnectionRedirect }
  | { status: "missing" }
  | { status: "corrupt" }
  | { status: "mismatch"; pending: V4PendingConnectionRedirect };

export const startConnectionRedirect = (
  href: string,
  pending: Omit<V4PendingConnectionRedirect, "state">
) => {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const url = new URL(href);
  url.searchParams.set("state", `${state}${url.searchParams.get("state") ?? ""}`);
  localStorage.setItem(V4_CONNECTION_REDIRECT_STORAGE_KEY, JSON.stringify({ ...pending, state }));
  window.location.assign(url.toString());
};

/**
 * A preset whose provider shares one redirect URI across apps (Azure) puts its app suffix, such as
 * <:>azure-key-vault, in the href's state; the stored state is the part before it.
 */
export const stateWithoutAppSuffix = (state: string) => state.split("<:>")[0];

/**
 * The state suffix for a provider that shares one redirect URI across apps. The shell stores only
 * credentials, so root values the callback needs (Azure's tenant ID) travel after the app.
 */
export const appStateSuffix = (app: string, values?: Record<string, unknown>) =>
  `<:>${app}${values ? `<:>${JSON.stringify(values)}` : ""}`;

/** The values appStateSuffix put in the state, or none. */
export const stateValues = (state: string): Record<string, unknown> => {
  const [, , values] = state.split("<:>");
  if (!values) return {};
  try {
    const parsed: unknown = JSON.parse(values);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** Clears the pending record only when the state matches, so a forged callback cannot drop it. */
export const takeConnectionRedirect = (rawState: string): TakenConnectionRedirect => {
  const state = stateWithoutAppSuffix(rawState);
  const raw = localStorage.getItem(V4_CONNECTION_REDIRECT_STORAGE_KEY);
  if (raw === null) return { status: "missing" };
  let pending: V4PendingConnectionRedirect;
  try {
    pending = JSON.parse(raw);
  } catch {
    localStorage.removeItem(V4_CONNECTION_REDIRECT_STORAGE_KEY);
    return { status: "corrupt" };
  }
  if (!state || pending.state !== state) return { status: "mismatch", pending };
  localStorage.removeItem(V4_CONNECTION_REDIRECT_STORAGE_KEY);
  return { status: "ok", pending };
};

export const connectionRedirect = ({
  extras,
  ...target
}: Omit<AppConnectionRedirect, "start"> & {
  extras?: ConnectionRedirectExtras;
}): AppConnectionRedirect => ({
  ...target,
  start: (href, pending) => startConnectionRedirect(href, { ...pending, ...extras })
});
