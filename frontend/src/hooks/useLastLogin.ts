import { useCallback } from "react";

import { LoginMethod } from "@app/hooks/api/admin/types";

import { useLocalStorageState } from "./useLocalStorageState";

const LAST_LOGIN_KEY = "infisical.lastLogin";

export type LastLogin = {
  method: LoginMethod;
  orgSlug?: string;
  timestamp: number;
};

export const useLastLogin = () => {
  const [lastLogin, setLastLogin] = useLocalStorageState<LastLogin | null>(LAST_LOGIN_KEY, null);

  const saveLastLogin = useCallback(
    (entry: Omit<LastLogin, "timestamp">) => {
      setLastLogin({ ...entry, timestamp: Date.now() });
    },
    [setLastLogin]
  );

  const clearLastLogin = useCallback(() => {
    setLastLogin(null);
  }, [setLastLogin]);

  return { lastLogin, saveLastLogin, clearLastLogin };
};
