export type V4QueryResult<TData> = { data: TData | undefined; isPending: boolean; error: unknown };

export type V4MutationOptions = { meta?: { skipErrorToast?: boolean } };

export const withMutationMeta =
  <TResult>(hook: (args: { options: { meta?: V4MutationOptions["meta"] } }) => TResult) =>
  (options?: V4MutationOptions) =>
    hook({ options: { meta: options?.meta } });

export type V4Mutation<TVariables, TData = unknown> = (options?: V4MutationOptions) => {
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
};
