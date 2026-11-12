import type {
  AppConnectionRedirect,
  PendingConnectionRedirect
} from "@app/components/v4/patterns/app-connection-form";
import { V4_CONNECTION_REDIRECT_STORAGE_KEY } from "@app/helpers/appConnections";

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
