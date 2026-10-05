import { createContext, useContext, useMemo } from "react";

import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

type TServiceVariables = {
  /** Undefined while the list loads, when no key can be called unknown yet. */
  variables?: TAgentVaultVariable[];
  /** The keys each stored value uses, by field. The values never return, so the fields list these. */
  storedKeys: {
    secret: string[];
    username: string[];
    customHeaders: Record<string, string[]>;
    substitutions: Record<string, string[]>;
  };
  /** Opens the new-variable dialog on top of the sheet. Resolves to null if it is dismissed. */
  requestVariable?: (key: string) => Promise<TAgentVaultVariable | null>;
};

export const NO_STORED_KEYS: TServiceVariables["storedKeys"] = {
  secret: [],
  username: [],
  customHeaders: {},
  substitutions: {}
};

export const ServiceVariablesContext = createContext<TServiceVariables>({
  storedKeys: NO_STORED_KEYS
});

export const useServiceVariables = () => useContext(ServiceVariablesContext);

/** Undefined while the list loads, so nothing is marked unknown before it can be known. */
export const useKnownVariableKeys = () => {
  const { variables } = useServiceVariables();
  return useMemo(
    () => (variables ? new Set(variables.map((variable) => variable.key)) : undefined),
    [variables]
  );
};
