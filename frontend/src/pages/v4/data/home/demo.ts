import { useRouterState } from "@tanstack/react-router";

import type { HomeAdapter, HomeDay } from "./contract";

const SCENARIOS = ["new", "active", "stressed"] as const;

const useHomeScenario = () =>
  useRouterState({
    select: (state) => {
      const value = (state.location.search as { home?: unknown }).home;
      return SCENARIOS.find((scenario) => scenario === value) ?? "active";
    }
  });

const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const NOW = Date.now();
const DAY = 86_400_000;
const pastDays = (values: number[]): HomeDay[] =>
  values.map((value, index) => ({
    date: new Date(NOW - (values.length - 1 - index) * DAY).toISOString(),
    value
  }));

export const homeDemo: HomeAdapter = {
  useSecretReads: () => {
    const scenario = useHomeScenario();
    if (scenario === "new") return ok({ total: 0, days: [] });
    const days = pastDays(
      scenario === "stressed"
        ? [41_200, 39_800, 28_400, 27_900, 44_100, 49_300, 50_400]
        : [1510, 1520, 1180, 1170, 1460, 1590, 1600]
    );
    return ok({ total: days.reduce((sum, day) => sum + day.value, 0), days });
  },
  useSetup: () => {
    const scenario = useHomeScenario();
    return ok(
      scenario === "new"
        ? { hasProject: true, hasSecrets: true, hasReads: false, members: 1 }
        : { hasProject: true, hasSecrets: true, hasReads: true, members: 12 }
    );
  }
};
