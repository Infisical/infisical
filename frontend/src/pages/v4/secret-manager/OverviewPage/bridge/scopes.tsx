import { createContext, useContext, useEffect, useRef, useState } from "react";

import type { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import { useV4Adapter } from "../../../data/adapters";
import type { ScopeState } from "../../../data/secrets/contract";
import type { ScopeSecrets } from "./view-model";

type ScopeRef = { environment: string; path: string };

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

const ScopeFetcher = ({
  projectId,
  scope,
  onResult,
  onFailed
}: {
  projectId: string;
  scope: ScopeRef;
  onResult: (key: string, secrets: SecretV3RawSanitized[]) => void;
  onFailed: (key: string) => void;
}) => {
  const { data, error } = useV4Adapter("secrets").useSecretsAt({
    projectId,
    environment: scope.environment,
    secretPath: scope.path
  });
  const last = useRef("");
  useEffect(() => {
    if (!data) return;
    const signature = JSON.stringify(data);
    if (signature === last.current) return;
    last.current = signature;
    onResult(scopeKey(scope), data);
  }, [data]);
  useEffect(() => {
    if (error && !data) onFailed(scopeKey(scope));
  }, [error, data]);
  return null;
};

export const useScopeSecrets = (projectId: string, scopes: readonly ScopeRef[]) => {
  const [loaded, setLoaded] = useState<Record<string, SecretV3RawSanitized[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const results: ScopeSecrets[] = scopes
    .filter((scope) => scopeKey(scope) in loaded)
    .map((scope) => ({ ...scope, secrets: loaded[scopeKey(scope)] }));
  const fetchers = scopes.map((scope) => (
    <ScopeFetcher
      key={scopeKey(scope)}
      projectId={projectId}
      scope={scope}
      onResult={(key, secrets) => setLoaded((current) => ({ ...current, [key]: secrets }))}
      onFailed={(key) =>
        setFailed((current) => (current.includes(key) ? current : [...current, key]))
      }
    />
  ));
  const state = (scope: ScopeRef): ScopeState => {
    const key = scopeKey(scope);
    if (key in loaded) return "loaded";
    return failed.includes(key) ? "failed" : "loading";
  };
  return { scopes: results, fetchers, state };
};
