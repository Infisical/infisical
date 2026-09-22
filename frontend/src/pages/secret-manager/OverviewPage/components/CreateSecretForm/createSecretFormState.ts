type SettledResultStatus = Pick<PromiseSettledResult<unknown>, "status">;

export const didAllSecretCreationsSucceed = (results: readonly SettledResultStatus[]) =>
  results.length > 0 && results.every(({ status }) => status === "fulfilled");

export const applyKeyCapitalization = (key: string, autoCapitalization: boolean | undefined) =>
  autoCapitalization ? key.toUpperCase() : key;
