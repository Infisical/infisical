import { createContext, useContext } from "react";

import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

type TServiceVariables = {
  /** Keys the form references that Agent Vault has confirmed it does not have. A key still being checked is not in it. */
  missingKeys: ReadonlySet<string>;
  /** The keys each stored value uses, by field. The values never return, so the fields list these. */
  storedKeys: {
    secret: string[];
    username: string[];
    customHeaders: Record<string, string[]>;
    substitutions: Record<string, string[]>;
  };
  /** Opens the new-variable dialog on top of the sheet. Resolves to null if it is dismissed. */
  requestVariable: (key: string) => Promise<TAgentVaultVariable | null>;
  /**
   * Set when the fields reference the caller's own variables instead of the global ones. There are few enough to hold
   * whole, so the list is filtered here rather than searched on the server. Undefined while it loads.
   */
  localVariables?: TAgentVaultVariable[];
  isLocal?: boolean;
};

export const NO_STORED_KEYS: TServiceVariables["storedKeys"] = {
  secret: [],
  username: [],
  customHeaders: {},
  substitutions: {}
};

export const NO_MISSING_KEYS: ReadonlySet<string> = new Set();

// Only the previews outside the credential step read the default, and they never ask for a variable.
export const ServiceVariablesContext = createContext<TServiceVariables>({
  missingKeys: NO_MISSING_KEYS,
  storedKeys: NO_STORED_KEYS,
  requestVariable: async () => null
});

export const useServiceVariables = () => useContext(ServiceVariablesContext);

export const useMissingVariableKeys = () => useServiceVariables().missingKeys;
