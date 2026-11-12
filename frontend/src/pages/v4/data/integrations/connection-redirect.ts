import type {
  AppConnectionRedirect,
  PendingConnectionRedirect
} from "@app/components/v4/patterns/app-connection-form";
import { V4_CONNECTION_REDIRECT_STORAGE_KEY } from "@app/helpers/appConnections";

export type TakenConnectionRedirect =
  | { status: "ok"; pending: PendingConnectionRedirect }
  | { status: "missing" }
  | { status: "corrupt" }
  | { status: "mismatch"; pending: PendingConnectionRedirect };

export const startConnectionRedirect: AppConnectionRedirect["start"] = (href, pending) => {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const url = new URL(href);
  url.searchParams.set("state", state);
  localStorage.setItem(V4_CONNECTION_REDIRECT_STORAGE_KEY, JSON.stringify({ ...pending, state }));
  window.location.assign(url.toString());
};

/** Clears the pending record only when the state matches, so a forged callback cannot drop it. */
export const takeConnectionRedirect = (state: string): TakenConnectionRedirect => {
  const raw = localStorage.getItem(V4_CONNECTION_REDIRECT_STORAGE_KEY);
  if (raw === null) return { status: "missing" };
  let pending: PendingConnectionRedirect;
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

export const connectionRedirect = (
  target: Omit<AppConnectionRedirect, "start">
): AppConnectionRedirect => ({ ...target, start: startConnectionRedirect });
