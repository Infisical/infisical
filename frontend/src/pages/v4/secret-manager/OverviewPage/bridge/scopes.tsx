import { createContext, useContext, useEffect, useRef, useState } from "react";

import type { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import { useV4Adapter } from "../../../data/adapters";
import type { ImportedSecrets, ScopeSecrets } from "./view-model";

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
  onResult
}: {
  projectId: string;
  scope: ScopeRef;
  onResult: (key: string, secrets: SecretV3RawSanitized[]) => void;
}) => {
  const { data } = useV4Adapter("secrets").useSecretsAt({
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
  return null;
};

export const useScopeSecrets = (projectId: string, scopes: readonly ScopeRef[]) => {
  const [loaded, setLoaded] = useState<Record<string, SecretV3RawSanitized[]>>({});
  const results: ScopeSecrets[] = scopes
    .filter((scope) => scopeKey(scope) in loaded)
    .map((scope) => ({ ...scope, secrets: loaded[scopeKey(scope)] }));
  const fetchers = scopes.map((scope) => (
    <ScopeFetcher
      key={scopeKey(scope)}
      projectId={projectId}
      scope={scope}
      onResult={(key, secrets) => setLoaded((current) => ({ ...current, [key]: secrets }))}
    />
  ));
  return { scopes: results, fetchers };
};

const ImportedFetcher = ({
  projectId,
  environment,
  path,
  onResult
}: {
  projectId: string;
  environment: string;
  path: string;
  onResult: (key: string, groups: ImportedSecrets["groups"]) => void;
}) => {
  const { data } = useV4Adapter("secrets").useImportedSecretsAt({
    projectId,
    environment,
    secretPath: path
  });
  const last = useRef("");
  useEffect(() => {
    if (!data) return;
    const signature = JSON.stringify(data);
    if (signature === last.current) return;
    last.current = signature;
    onResult(scopeKey({ environment, path }), data);
  }, [data]);
  return null;
};

export const useImportedSecrets = (
  projectId: string,
  environments: readonly string[],
  path: string
) => {
  const [loaded, setLoaded] = useState<Record<string, ImportedSecrets["groups"]>>({});
  const results: ImportedSecrets[] = environments
    .filter((environment) => scopeKey({ environment, path }) in loaded)
    .map((environment) => ({ environment, groups: loaded[scopeKey({ environment, path })] }));
  const fetchers = environments.map((environment) => (
    <ImportedFetcher
      key={scopeKey({ environment, path })}
      projectId={projectId}
      environment={environment}
      path={path}
      onResult={(key, groups) => setLoaded((current) => ({ ...current, [key]: groups }))}
    />
  ));
  return { scopes: results, fetchers };
};
