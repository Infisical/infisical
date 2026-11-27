import { createContext, useContext, useEffect, useRef, useState } from "react";

import type { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import { useV4Adapter } from "../../../data/adapters";
import type { ImportedSecrets, ScopeSecrets } from "./view-model";

type ScopeRef = { environment: string; path: string };
export type ScopeState = "loading" | "loaded" | "failed";

export const BreadthContext = createContext<(delta: number) => void>(() => undefined);

export const useRequestBreadth = (active: boolean) => {
  const hold = useContext(BreadthContext);
  useEffect(() => {
    if (!active) return undefined;
    hold(1);
    return () => hold(-1);
  }, [active, hold]);
};
const scopeKey = (scope: ScopeRef) => `${scope.environment}\u0000${scope.path}`;

const useReport = <T,>(
  key: string,
  data: T | undefined,
  error: unknown,
  onResult: (key: string, value: T) => void,
  onError: (key: string) => void
) => {
  const last = useRef("");
  useEffect(() => {
    if (!data) return;
    const signature = JSON.stringify(data);
    if (signature === last.current) return;
    last.current = signature;
    onResult(key, data);
  }, [data]);
  useEffect(() => {
    if (error && !data) onError(key);
  }, [error, data]);
};

const useScopeStore = <T,>() => {
  const [loaded, setLoaded] = useState<Record<string, T>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  return {
    loaded,
    onResult: (key: string, value: T) => {
      setLoaded((current) => ({ ...current, [key]: value }));
      setFailed(({ [key]: _, ...rest }) => rest);
    },
    onError: (key: string) => setFailed((current) => ({ ...current, [key]: true })),
    state: (scope: ScopeRef): ScopeState => {
      if (scopeKey(scope) in loaded) return "loaded";
      return scopeKey(scope) in failed ? "failed" : "loading";
    }
  };
};

const ScopeFetcher = ({
  projectId,
  scope,
  onResult,
  onError
}: {
  projectId: string;
  scope: ScopeRef;
  onResult: (key: string, secrets: SecretV3RawSanitized[]) => void;
  onError: (key: string) => void;
}) => {
  const { data, error } = useV4Adapter("secrets").useSecretsAt({
    projectId,
    environment: scope.environment,
    secretPath: scope.path
  });
  useReport(scopeKey(scope), data, error, onResult, onError);
  return null;
};

export const useScopeSecrets = (projectId: string, scopes: readonly ScopeRef[]) => {
  const store = useScopeStore<SecretV3RawSanitized[]>();
  const results: ScopeSecrets[] = scopes
    .filter((scope) => scopeKey(scope) in store.loaded)
    .map((scope) => ({ ...scope, secrets: store.loaded[scopeKey(scope)] }));
  const fetchers = scopes.map((scope) => (
    <ScopeFetcher
      key={scopeKey(scope)}
      projectId={projectId}
      scope={scope}
      onResult={store.onResult}
      onError={store.onError}
    />
  ));
  return { scopes: results, fetchers, state: store.state };
};

const ImportedFetcher = ({
  projectId,
  environment,
  path,
  onResult,
  onError
}: {
  projectId: string;
  environment: string;
  path: string;
  onResult: (key: string, groups: ImportedSecrets["groups"]) => void;
  onError: (key: string) => void;
}) => {
  const { data, error } = useV4Adapter("secrets").useImportedSecretsAt({
    projectId,
    environment,
    secretPath: path
  });
  useReport(scopeKey({ environment, path }), data, error, onResult, onError);
  return null;
};

export const useImportedSecrets = (
  projectId: string,
  environments: readonly string[],
  path: string
) => {
  const store = useScopeStore<ImportedSecrets["groups"]>();
  const results: ImportedSecrets[] = environments
    .filter((environment) => scopeKey({ environment, path }) in store.loaded)
    .map((environment) => ({
      environment,
      groups: store.loaded[scopeKey({ environment, path })]
    }));
  const fetchers = environments.map((environment) => (
    <ImportedFetcher
      key={scopeKey({ environment, path })}
      projectId={projectId}
      environment={environment}
      path={path}
      onResult={store.onResult}
      onError={store.onError}
    />
  ));
  return {
    scopes: results,
    fetchers,
    state: (environment: string) => store.state({ environment, path })
  };
};
