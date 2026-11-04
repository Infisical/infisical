import { useRouterState } from "@tanstack/react-router";

import type { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import { createFixtureStore } from "../fixture-store";
import { createSecretsFixtures, type DemoSecret, type SecretsFixtures } from "./fixtures";

const SCENARIOS = [
  "overview",
  "compare",
  "permissions",
  "loading",
  "error",
  "empty",
  "no-environments",
  "legacy",
  "large"
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const useScenario = (): Scenario => {
  const value = useRouterState({
    select: (state) => new URLSearchParams(state.location.searchStr).get("scenario")
  });
  return SCENARIOS.find((scenario) => scenario === value) ?? "overview";
};

const emptied = (fixtures: SecretsFixtures): SecretsFixtures => ({
  ...fixtures,
  secrets: [],
  folders: [],
  imports: [],
  dynamicSecrets: [],
  rotations: [],
  honeyTokens: [],
  proxiedServices: [],
  secretSyncs: [],
  commits: [],
  folderAccess: { ...fixtures.folderAccess, grants: [] }
});

const stores = {
  base: createFixtureStore(createSecretsFixtures(false)),
  large: createFixtureStore(createSecretsFixtures(true)),
  empty: createFixtureStore(emptied(createSecretsFixtures(false)))
};
export const recovered = createFixtureStore(false);

const storeOf = (scenario: Scenario) => {
  if (scenario === "large") return stores.large;
  if (scenario === "empty") return stores.empty;
  return stores.base;
};

export const useStore = () => storeOf(useScenario());
export type DemoStore = ReturnType<typeof useStore>;

export const demoMutation =
  <TVariables, TData = object>(run: (store: DemoStore, variables: TVariables) => TData) =>
  () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (variables: TVariables) => run(store, variables)
    };
  };

export const now = () => new Date().toISOString();
export const childPath = (path: string, name: string) => `${path === "/" ? "" : path}/${name}`;
export const within = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`);
export const sanitize = ({
  value: _value,
  valueOverride: _override,
  projectId: _project,
  ...secret
}: DemoSecret): SecretV3RawSanitized => secret;

export const recordVersion = (store: DemoStore, secret: DemoSecret) =>
  store.update((state) => {
    const history = state.versionHistory[secret.id] ?? [];
    if (history.some((entry) => entry.version === secret.version)) return state;
    return {
      ...state,
      versionHistory: {
        ...state.versionHistory,
        [secret.id]: [
          {
            version: secret.version,
            value: secret.value ?? "",
            createdAt: secret.updatedAt,
            actor: "Sarah Lin",
            actorType: "user"
          },
          ...history
        ]
      }
    };
  });

export const updateSecrets = (
  store: DemoStore,
  match: (secret: DemoSecret) => boolean,
  change: (secret: DemoSecret) => DemoSecret | null
) =>
  store.update((state) => ({
    ...state,
    secrets: state.secrets.flatMap((secret) => {
      if (!match(secret)) return [secret];
      const next = change(secret);
      return next ? [next] : [];
    })
  }));

export const secretAt =
  (projectId: string, environment: string, path: string, key: string) => (secret: DemoSecret) =>
    secret.projectId === projectId &&
    secret.env === environment &&
    secret.path === path &&
    secret.key === key;
