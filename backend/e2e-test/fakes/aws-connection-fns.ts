import { BadRequestError } from "@app/lib/errors";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";

import type * as RealProvider from "../../src/services/app-connection/aws/aws-connection-fns";

// AWS itself is not under test in the secret sync specs, so the whole provider is replaced.
// Wired up by test.alias in vitest.e2e.config.mts. Nothing under src/ references this file.
//
// The two pure exports come from the real module, and the type import above reaches it too.
// Both use this relative path deliberately: the aliases key on the specifiers
// "./aws-connection-fns" and "@app/services/app-connection/aws/aws-connection-fns", so this
// path is not itself aliased and does not resolve back to this file.
export {
  buildAwsConnectionConfig,
  getAwsConnectionListItem
} from "../../src/services/app-connection/aws/aws-connection-fns";

const DEFAULT_ACCOUNT_ID = "000000000000";

type TFakeAwsConnectionState = {
  accountId: string | null;
  validationError: string | null;
};

const state: TFakeAwsConnectionState = {
  accountId: DEFAULT_ACCOUNT_ID,
  validationError: null
};

// Behavior a spec can change. Every field resets between test files, so a spec never inherits
// another's configuration. See e2e-test/setup/reset-fakes.ts.
export const fakeAwsConnection = {
  reset: () => {
    state.accountId = DEFAULT_ACCOUNT_ID;
    state.validationError = null;
  },

  // What getAwsAccountId reports. null reproduces the real module's behavior when STS fails.
  returnsAccountId: (accountId: string | null) => {
    state.accountId = accountId;
  },

  // Make credential validation reject, as the real provider does for bad credentials.
  // Pass null to go back to accepting.
  failsValidationWith: (message: string | null) => {
    state.validationError = message;
  }
};

// Mirrors the real access-key branch, which hands back whatever the connection carries and
// makes no request. The assume-role branch is the one that calls STS, and no spec uses it.
export const getAwsConnectionConfig = (appConnection: TAwsConnectionConfig, region = AWSRegion.US_EAST_1) => {
  const { credentials } = appConnection;

  return Promise.resolve({
    region,
    credentials: {
      accessKeyId: "accessKeyId" in credentials ? credentials.accessKeyId : "fake-access-key-id",
      secretAccessKey: "secretAccessKey" in credentials ? credentials.secretAccessKey : "fake-secret-access-key",
      sessionToken: undefined as string | undefined
    }
  });
};

export const validateAwsConnectionCredentials = (appConnection: TAwsConnectionConfig) => {
  if (state.validationError) {
    // Same error type as the real module, so a spec can assert on the status and message.
    throw new BadRequestError({ message: `Unable to validate connection: ${state.validationError}` });
  }

  return Promise.resolve(appConnection.credentials);
};

// Takes no argument on purpose: callers pass a connection and JavaScript ignores it, while a
// zero-argument function still satisfies the real signature structurally.
export const getAwsAccountId = (): Promise<string | null> => Promise.resolve(state.accountId);

// Nothing forces a module replaced by an alias to match the module it replaces, so a signature
// change in the real provider would otherwise leave this fake quietly wrong. This assignment
// fails type-checking instead.
export const assertFakeMatchesRealProvider: Pick<
  typeof RealProvider,
  "validateAwsConnectionCredentials" | "getAwsAccountId" | "getAwsConnectionConfig"
> = {
  validateAwsConnectionCredentials,
  getAwsAccountId,
  getAwsConnectionConfig
};
