import axios from "axios";

import { SessionStorageKeys } from "@app/const";

export const clearCliToken = () => sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);

const readStoredToken = () => {
  const stored = sessionStorage.getItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
  if (!stored) return undefined;
  const { expiry, data, callbackPort } = JSON.parse(stored) as {
    expiry: string;
    data: string;
    callbackPort?: number;
  };
  if (new Date() > new Date(expiry)) {
    clearCliToken();
    return undefined;
  }
  return { data, callbackPort };
};

export const readCliToken = () => readStoredToken()?.data;

// A failed POST leaves the token in session storage so the page offers it for a manual copy.
export const pushCliTokenToTerminal = async () => {
  try {
    const stored = readStoredToken();
    if (!stored?.callbackPort) return;
    const payload = JSON.parse(window.atob(stored.data));
    await axios.create().post(`http://127.0.0.1:${stored.callbackPort}/`, payload);
    clearCliToken();
  } catch {
    // Left in place for the manual copy fallback.
  }
};
