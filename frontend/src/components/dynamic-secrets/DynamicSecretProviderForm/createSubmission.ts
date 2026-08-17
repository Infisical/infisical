export type TDynamicSecretCreateSubmissionResult<TResult> = {
  successfulResults: TResult[];
  failedCount: number;
};

/**
 * Settle an entire provider-owned create batch so the form can distinguish a
 * total failure from partial success and avoid resubmitting completed items.
 */
export const submitDynamicSecretCreatePayloads = async <TPayload, TResult>(
  payloads: readonly TPayload[],
  submit: (payload: TPayload) => Promise<TResult>
): Promise<TDynamicSecretCreateSubmissionResult<TResult>> => {
  const settledResults = await Promise.allSettled(payloads.map((payload) => submit(payload)));
  const successfulResults = settledResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );

  return {
    successfulResults,
    failedCount: settledResults.length - successfulResults.length
  };
};
