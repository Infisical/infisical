import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { useV4Adapter } from "../../../data/adapters";
import type { Secret } from "../secrets-model";
import { type LoadedValues, valueKey } from "./view-model";

type ValueRequest = {
  environment: string;
  path: string;
  key: string;
  version: number;
  isOverride?: boolean;
};
type Waiter = { keys: string[]; resolve: (values: LoadedValues) => void };

export type ValueLoader = {
  request: (secrets: readonly Secret[], isOverride?: boolean) => void;
  ensure: (secrets: readonly Secret[], isOverride?: boolean) => Promise<LoadedValues>;
};

const ValueLoaderContext = createContext<ValueLoader>({
  request: () => undefined,
  ensure: async () => ({})
});

export const useValueLoader = () => useContext(ValueLoaderContext);

const toRequest = (secret: Secret, isOverride?: boolean): ValueRequest => ({
  environment: secret.environment,
  path: secret.path,
  key: secret.name,
  version: secret.version,
  isOverride
});
const keyOf = (request: ValueRequest) =>
  valueKey(request.environment, request.path, request.key, request.isOverride, request.version);
const needsFetch = (secret: Secret, isOverride?: boolean) =>
  isOverride ? secret.override !== undefined : secret.value.status === "loading";

const ValueFetcher = ({
  projectId,
  request,
  onResult
}: {
  projectId: string;
  request: ValueRequest;
  onResult: (key: string, value: string | { error: string }) => void;
}) => {
  const { data, error } = useV4Adapter("secrets").useSecretValue({
    projectId,
    environment: request.environment,
    secretPath: request.path,
    secretKey: request.key,
    isOverride: request.isOverride
  });
  const value = request.isOverride ? data?.valueOverride : data?.value;
  const done = useRef(false);
  useEffect(() => {
    if (done.current || (!data && !error)) return;
    done.current = true;
    if (data) onResult(keyOf(request), value ?? "");
    else if (error)
      onResult(keyOf(request), {
        error: error instanceof Error ? error.message : "Could not read the value"
      });
  }, [data, error]);
  return null;
};

export const useSecretValues = (projectId: string) => {
  const [values, setValues] = useState<LoadedValues>({});
  const [requested, setRequested] = useState<Record<string, ValueRequest>>({});
  const waiters = useRef<Waiter[]>([]);
  const latest = useRef(values);
  latest.current = values;

  useEffect(() => {
    waiters.current = waiters.current.filter((waiter) => {
      if (!waiter.keys.every((key) => key in values)) return true;
      waiter.resolve(values);
      return false;
    });
  }, [values]);

  const loader = useMemo<ValueLoader>(() => {
    const add = (requests: ValueRequest[]) => {
      const missing = requests.filter((request) => !(keyOf(request) in latest.current));
      if (!missing.length) return;
      setRequested((current) => {
        const next = { ...current };
        missing.forEach((request) => {
          next[keyOf(request)] = request;
        });
        return next;
      });
    };
    return {
      request: (secrets, isOverride) =>
        add(
          secrets
            .filter((secret) => needsFetch(secret, isOverride))
            .map((secret) => toRequest(secret, isOverride))
        ),
      ensure: (secrets, isOverride) => {
        const requests = secrets
          .filter((secret) => needsFetch(secret, isOverride))
          .map((secret) => toRequest(secret, isOverride));
        const keys = requests.map(keyOf);
        if (keys.every((key) => key in latest.current)) return Promise.resolve(latest.current);
        add(requests);
        return new Promise<LoadedValues>((resolve) => {
          waiters.current.push({ keys, resolve });
        });
      }
    };
  }, []);

  const fetchers = Object.entries(requested)
    .filter(([key]) => !(key in values))
    .map(([key, request]) => (
      <ValueFetcher
        key={key}
        projectId={projectId}
        request={request}
        onResult={(resultKey, value) =>
          setValues((current) => ({ ...current, [resultKey]: value }))
        }
      />
    ));

  return {
    values,
    loader,
    forget: (keys: string[]) =>
      setValues((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key)))
      ),
    provider: (children: ReactNode) => (
      <ValueLoaderContext value={loader}>
        {children}
        {fetchers}
      </ValueLoaderContext>
    )
  };
};
