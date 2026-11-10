export type V4QueryResult<TData> = { data: TData | undefined; isPending: boolean; error: unknown };

export type V4Mutation<TVariables, TData = unknown> = () => {
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
};

export type V4MutationOptions = { skipErrorToast?: boolean };

export type V4ConfigurableMutation<TVariables, TData = unknown> = (
  options?: V4MutationOptions
) => ReturnType<V4Mutation<TVariables, TData>>;
