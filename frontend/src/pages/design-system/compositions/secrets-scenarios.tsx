import { createContext, type ReactNode, useContext, useState } from "react";

import { Select } from "@app/components/v4/ui/select";

import { type Scenario, scenarios } from "./secrets-model";

const SecretsScenarioContext = createContext<Scenario>("overview");
export const useSecretsScenario = () => useContext(SecretsScenarioContext);

export function SecretsScenarios({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>("overview");
  return (
    <SecretsScenarioContext.Provider value={scenario}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-sm">Local demo data</span>
        <Select
          aria-label="Secrets scenario"
          value={scenario}
          options={scenarios}
          onChange={(value) => setScenario(value as Scenario)}
        />
        <span className="text-muted-foreground text-xs">
          Changes stay in this preview. No production requests are sent.
        </span>
      </div>
      {children}
    </SecretsScenarioContext.Provider>
  );
}
