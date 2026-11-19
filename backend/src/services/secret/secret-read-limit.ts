import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

export type TSecretReadLimit = {
  count: (secretCount: number) => void;
};

export const createSecretReadLimit = ({
  enforceSecretReadLimit,
  environment,
  secretPath
}: {
  enforceSecretReadLimit?: boolean;
  environment: string;
  secretPath: string;
}): TSecretReadLimit | undefined => {
  if (!enforceSecretReadLimit) return undefined;

  const maxSecrets = getConfig().MAX_SECRETS_PER_READ_REQUEST;
  let counted = 0;

  return {
    count: (secretCount) => {
      counted += secretCount;
      if (counted <= maxSecrets) return;

      throw new BadRequestError({
        name: "SecretReadLimitExceeded",
        message: `Reading secret path '${secretPath}' in environment '${environment}' would return more than ${maxSecrets} secrets, counting imported secrets and subfolders, which is the most a single request can return. Read a narrower secret path, or turn off recursive or include imports.`
      });
    }
  };
};
