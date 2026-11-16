import { useRouterState } from "@tanstack/react-router";

import { createFixtureStore } from "../fixture-store";
import type { SecretsActivationAdapter } from "./contract-activation";

const checked = createFixtureStore(false);

export const secretsActivationDemo: SecretsActivationAdapter = {
  useSecretsActivationCheck: () => async () => {
    if (checked.get()) return false;
    checked.update(() => true);
    return true;
  },
  useActivationVariant: () => {
    const card = useRouterState({
      select: (state) => new URLSearchParams(state.location.searchStr).get("nudge") === "card"
    });
    return { data: card ? "card" : "control", isPending: false, error: null };
  }
};
