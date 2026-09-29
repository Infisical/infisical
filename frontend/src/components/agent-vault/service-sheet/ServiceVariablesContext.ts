import { createContext, useContext } from "react";

import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

type TServiceVariables = {
  /** Undefined while the list loads, when no key can be called unknown yet. */
  variables?: TAgentVaultVariable[];
  /** The stored values that are one reference and nothing else, by field, so they can be shown again. */
  seeded: {
    secret?: string;
    username?: string;
    customHeaders: Record<string, string>;
    substitutions: Record<string, string>;
  };
  /** Opens the new-variable dialog on top of the sheet. Resolves to null if it is dismissed. */
  requestVariable?: (key: string) => Promise<TAgentVaultVariable | null>;
};

export const NO_SEEDED_REFERENCES: TServiceVariables["seeded"] = {
  customHeaders: {},
  substitutions: {}
};

export const ServiceVariablesContext = createContext<TServiceVariables>({
  seeded: NO_SEEDED_REFERENCES
});

export const useServiceVariables = () => useContext(ServiceVariablesContext);
