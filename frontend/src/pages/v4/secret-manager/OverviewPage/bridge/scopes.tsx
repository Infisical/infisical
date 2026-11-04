import { useEffect, useRef, useState } from "react";

import type { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import { useV4Adapter } from "../../../data/adapters";
import type { ScopeSecrets } from "./view-model";

type ScopeRef = { environment: string; path: string };
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
