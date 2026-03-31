import axios from "axios";

import { setAuthToken } from "../reactQuery";
import { GetAuthTokenAPI } from "./types";

// BroadcastChannel for cross-tab token synchronization
const tokenBroadcastChannel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("infisical-token-refresh") : null;

// Listen for token updates from other tabs
if (tokenBroadcastChannel) {
  tokenBroadcastChannel.onmessage = (event: MessageEvent<{ token: string }>) => {
    if (event.data?.token) {
      setAuthToken(event.data.token);
    }
  };
}

// Shared promise to deduplicate concurrent refresh calls
let activeRefreshPromise: Promise<GetAuthTokenAPI> | null = null;

/**
 * Refresh the auth token using the httpOnly refresh token cookie.
 * Uses a standalone axios call (not apiRequest) to avoid circular imports with request.ts.
 * Deduplicates concurrent calls and broadcasts the new token to other tabs.
 */
export const fetchAuthToken = async (): Promise<GetAuthTokenAPI> => {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = axios
    .post<GetAuthTokenAPI>("/api/v1/auth/token", undefined, {
      withCredentials: true
    })
    .then(({ data }) => {
      setAuthToken(data.token);

      // Notify other tabs of the refreshed token
      tokenBroadcastChannel?.postMessage({ token: data.token });

      return data;
    })
    .finally(() => {
      activeRefreshPromise = null;
    });

  return activeRefreshPromise;
};
