import axios from "axios";
import { jwtDecode } from "jwt-decode";

import { getAuthToken, setAuthToken } from "../reactQuery";
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
 * If an in-memory token already exists (e.g. after selectOrganization),
 * decode it directly to avoid stale cache from the refresh endpoint.
 */
export const fetchAuthToken = async (): Promise<GetAuthTokenAPI> => {
  // If we already have an in-memory token, decode org context from it directly
  const currentToken = getAuthToken();
  if (currentToken) {
    try {
      const decoded = jwtDecode<{
        organizationId?: string;
        subOrganizationId?: string;
        exp?: number;
      }>(currentToken);
      // Only reuse if the token has more than 10 seconds before expiry
      if (decoded.exp && decoded.exp * 1000 > Date.now() + 10_000) {
        return {
          token: currentToken,
          organizationId: decoded.organizationId,
          subOrganizationId: decoded.subOrganizationId
        };
      }
    } catch {
      // decode failed — fall through to refresh
    }
  }

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
