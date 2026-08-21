import {
  isCancelledError,
  MutationCache,
  MutationObserver,
  QueryClient
} from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";

test("query defaults keep fresh data cached", async () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 60_000
      }
    }
  });
  const queryKey = ["compatibility", "defaults"] as const;
  let fetchCount = 0;
  const fetchCachedValue = () =>
    queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        fetchCount += 1;
        return { fetchCount };
      }
    });

  assert.equal(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus, false);
  assert.equal(queryClient.getDefaultOptions().queries?.retry, 1);
  assert.equal(queryClient.getDefaultOptions().queries?.staleTime, 60_000);
  assert.deepEqual(await fetchCachedValue(), { fetchCount: 1 });
  assert.deepEqual(await fetchCachedValue(), { fetchCount: 1 });
  assert.equal(fetchCount, 1);

  queryClient.clear();
});

test("partial-key invalidation preserves cached data and marks the query stale", async () => {
  const queryClient = new QueryClient();
  const queryKey = ["compatibility", "projects", { organizationId: "org-1" }] as const;
  const cachedProjects = [{ id: "project-1" }];

  queryClient.setQueryData(queryKey, cachedProjects);
  await queryClient.invalidateQueries({
    queryKey: ["compatibility", "projects"],
    refetchType: "none"
  });

  assert.deepEqual(queryClient.getQueryData(queryKey), cachedProjects);
  assert.equal(
    queryClient.getQueryCache().find({ exact: true, queryKey })?.state.isInvalidated,
    true
  );

  queryClient.clear();
});

test("failed optimistic mutations roll back and reach the global error handler", async () => {
  const mutationError = new Error("sync failed");
  const handledErrors: Array<{
    error: Error;
    meta: Record<string, unknown> | undefined;
    onMutateResult: unknown;
    variables: unknown;
  }> = [];
  const queryClient = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, variables, onMutateResult, mutation) => {
        handledErrors.push({
          error,
          meta: mutation.meta,
          onMutateResult,
          variables
        });
      }
    })
  });
  const queryKey = ["compatibility", "pki-sync", "sync-1"] as const;
  const initialSync = { status: "idle" };
  queryClient.setQueryData(queryKey, initialSync);

  const observer = new MutationObserver(queryClient, {
    meta: { handledErrorCodes: ["KnownError"] },
    mutationFn: async ({ syncId }: { syncId: string }) => {
      assert.equal(syncId, "sync-1");
      throw mutationError;
    },
    mutationKey: ["compatibility", "start-pki-sync"],
    onError: (_error, _variables, onMutateResult) => {
      if (onMutateResult) {
        queryClient.setQueryData(queryKey, onMutateResult.previousSync);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previousSync = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { status: "pending" });
      return { previousSync };
    },
    retry: false
  });

  await assert.rejects(observer.mutate({ syncId: "sync-1" }), (error) => {
    assert.equal(error, mutationError);
    return true;
  });

  assert.deepEqual(queryClient.getQueryData(queryKey), initialSync);
  assert.deepEqual(handledErrors, [
    {
      error: mutationError,
      meta: { handledErrorCodes: ["KnownError"] },
      onMutateResult: { previousSync: initialSync },
      variables: { syncId: "sync-1" }
    }
  ]);

  queryClient.clear();
});

test("cancelling a query aborts its signal and leaves the cache idle", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const queryKey = ["compatibility", "cancel"] as const;
  let resolveStarted: (signal: AbortSignal) => void = (signal) => {
    throw new Error(`query start resolver was not initialized for aborted=${signal.aborted}`);
  };
  const started = new Promise<AbortSignal>((resolve) => {
    resolveStarted = resolve;
  });
  const fetchPromise = queryClient.fetchQuery({
    queryKey,
    queryFn: ({ signal }) => {
      resolveStarted(signal);
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
  });
  const signal = await started;

  await queryClient.cancelQueries({ queryKey });
  await assert.rejects(fetchPromise, (error) => {
    assert.equal(isCancelledError(error), true);
    return true;
  });

  assert.equal(signal.aborted, true);
  assert.equal(queryClient.getQueryState(queryKey)?.fetchStatus, "idle");
  assert.equal(queryClient.getQueryState(queryKey)?.status, "pending");

  queryClient.clear();
});

test("query errors retry once before reaching the cache", async () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        retryDelay: 0
      }
    }
  });
  const queryError = new Error("query failed");
  const queryKey = ["compatibility", "retry"] as const;
  let attemptCount = 0;

  await assert.rejects(
    queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        attemptCount += 1;
        throw queryError;
      }
    }),
    (error) => {
      assert.equal(error, queryError);
      return true;
    }
  );

  assert.equal(attemptCount, 2);
  assert.equal(queryClient.getQueryState(queryKey)?.error, queryError);
  assert.equal(queryClient.getQueryState(queryKey)?.fetchFailureCount, 2);
  assert.equal(queryClient.getQueryState(queryKey)?.status, "error");

  queryClient.clear();
});
