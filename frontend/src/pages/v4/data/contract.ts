export type V4QueryResult<TData> = { data: TData | undefined; isPending: boolean; error: unknown };

export type V4Mutation<TVariables, TData = unknown> = () => {
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
};
