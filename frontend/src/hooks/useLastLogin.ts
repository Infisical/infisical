import { useCallback } from "react";

import { LoginMethod } from "@app/hooks/api/admin/types";

import { useLocalStorageState } from "./useLocalStorageState";

const LAST_LOGIN_KEY = "infisical.lastLogin";
export const LEGACY_GENERIC_SSO_LOGIN_METHOD = "sso" as const;

type SsoLoginMethod = LoginMethod.SAML | LoginMethod.OIDC;
type DirectLoginMethod = Exclude<LoginMethod, SsoLoginMethod | LoginMethod.LDAP>;
type LastLoginIdentifier = {
  type: "email" | "orgSlug";
  value: string;
};

export type LastLoginEntry =
  | {
      method: SsoLoginMethod;
      identifier: LastLoginIdentifier;
    }
  | {
      method: LoginMethod.LDAP;
      organizationSlug?: string;
    }
  | {
      method: DirectLoginMethod;
    };

export type LastLogin = LastLoginEntry & { timestamp: number };

type LegacyLastLogin = {
  identifierType?: LastLoginIdentifier["type"];
  method: LoginMethod | typeof LEGACY_GENERIC_SSO_LOGIN_METHOD;
  orgSlug?: string;
  timestamp: number;
};

export type StoredLastLogin = LastLogin | LegacyLastLogin;

export const getLastLoginIdentifier = (
  lastLogin: StoredLastLogin | null
): LastLoginIdentifier | undefined => {
  if (!lastLogin) return undefined;
  if ("identifier" in lastLogin) return lastLogin.identifier;
  if (!("identifierType" in lastLogin) || !lastLogin.identifierType || !lastLogin.orgSlug) {
    return undefined;
  }

  return { type: lastLogin.identifierType, value: lastLogin.orgSlug };
};

export const getLastLoginOrganizationSlug = (lastLogin: StoredLastLogin | null) => {
  if (lastLogin?.method !== LoginMethod.LDAP) return undefined;
  if ("organizationSlug" in lastLogin) return lastLogin.organizationSlug;

  return "orgSlug" in lastLogin ? lastLogin.orgSlug : undefined;
};

export const useLastLogin = () => {
  const [lastLogin, setLastLogin] = useLocalStorageState<StoredLastLogin | null>(
    LAST_LOGIN_KEY,
    null
  );

  const saveLastLogin = useCallback(
    (entry: LastLoginEntry) => {
      setLastLogin({ ...entry, timestamp: Date.now() });
    },
    [setLastLogin]
  );

  const clearLastLogin = useCallback(() => {
    setLastLogin(null);
  }, [setLastLogin]);

  return { lastLogin, saveLastLogin, clearLastLogin };
};
