import {
  TAwsIamUserSecretRotationGeneratedCredentials,
  TAwsIamUserSecretRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/aws-iam-user-secret";
import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { BadRequestError } from "@app/lib/errors";

// Type-only, and by a path the aliases do not match, so this does not resolve back to here.
import type * as RealProvider from "../../src/ee/services/secret-rotation-v2/aws-iam-user-secret/aws-iam-user-secret-rotation-fns";

// Stands in for the AWS IAM user secret provider so the specs can drive the rotation plumbing
// without reaching IAM. Wired up by test.alias in vitest.e2e.config.mts; nothing under src/
// references this file.
//
// The IAM user itself is not modelled. `parameters.userName` is accepted and ignored, and the
// store starts empty: the first key exists because issueCredentials created it, which is what
// creating a rotation does. A real provider would create the key on that named user.
//
// Unlike the Parameter Store fake, this does not mirror one real provider's behaviour. The
// provider side of rotation has two shapes, and which one a provider is decides nothing about
// the plumbing but everything about what the plumbing has to hand it:
//
//   replace-in-place    one live credential. Publishing the new one kills the old immediately,
//                       so `credentialsToRevoke` names a credential that is already dead. What
//                       the provider needs is `activeCredentials`, to authenticate as itself.
//                       This is ldap-password, unix-linux, windows and hp-ilo.
//
//   issue-and-displace  two live credentials. The new one is published while the previous stays
//                       usable, and the credential two rotations back is the one retired. What
//                       the provider needs is `credentialsToRevoke`. This is datadog-api-key,
//                       azure-client-secret and most API key providers.
//
// Each mode reacts to a different one of those two arguments, so which credentials are left live
// is enough for a spec to tell what the service handed over. A provider given the two the wrong
// way round would revoke the credential its users are holding, and the key store says so.

export enum FakeIamRotationMode {
  ReplaceInPlace = "replace-in-place",
  IssueAndDisplace = "issue-and-displace"
}

type TFakeIamState = {
  mode: FakeIamRotationMode;
  // The live access keys on the IAM user, by access key ID.
  keys: Map<string, string>;
  issueError: string | null;
  afterPersistError: string | null;
  keySequence: number;
};

// The state hangs off globalThis rather than module scope on purpose. The alias makes this
// module reachable by more than one specifier (the server reaches it through the service's
// relative import, a spec through its own path), and the bundler then instantiates it twice:
// the rotation writes to one copy while the spec reads an empty other one, and the only symptom
// is an assertion that never comes true. Same reasoning as the AWS sync fakes.
const globalScope = globalThis as typeof globalThis & {
  infisicalFakeIamUserSecret?: TFakeIamState;
};

const DEFAULTS = {
  mode: FakeIamRotationMode.IssueAndDisplace,
  issueError: null,
  afterPersistError: null,
  keySequence: 0
};

globalScope.infisicalFakeIamUserSecret ??= { ...DEFAULTS, keys: new Map() };

const state = globalScope.infisicalFakeIamUserSecret;

// Behavior a spec can change. Everything resets between test files, so a spec never inherits
// another's state or configuration. See e2e-test/setup/reset-fakes.ts.
export const fakeIamUserSecret = {
  reset: () => {
    Object.assign(state, DEFAULTS);
    state.keys.clear();
  },

  // Which of the two provider shapes the factory behaves as. See the comment above.
  setMode: (mode: FakeIamRotationMode) => {
    state.mode = mode;
  },

  // The access keys that exist on the IAM user right now, as the provider sees them.
  keys: (): Record<string, string> => Object.fromEntries(state.keys),

  // Make key creation fail, as IAM would for a missing user or a denied policy. Applies to both
  // issueCredentials and rotateCredentials, since both create a key.
  failIssueWith: (message: string | null) => {
    state.issueError = message;
  },

  // Make the factory throw *after* the callback has committed the new credentials. A provider
  // that retires the displaced key after publishing the new one, rather than before, fails here
  // when that retirement fails, with the rotation already persisted.
  failAfterPersistWith: (message: string | null) => {
    state.afterPersistError = message;
  },

  // Delete a key behind Infisical's back, as an operator revoking it in the AWS console would.
  revokeOutOfBand: (accessKeyId: string) => {
    state.keys.delete(accessKeyId);
  }
};

const $createKey = (): TAwsIamUserSecretRotationGeneratedCredentials[number] => {
  if (state.issueError) throw new BadRequestError({ message: state.issueError });

  state.keySequence += 1;
  const sequence = String(state.keySequence).padStart(4, "0");
  const credential = {
    accessKeyId: `AKIAFAKE${sequence}`,
    secretAccessKey: `fake-secret-access-key-${sequence}`
  };

  state.keys.set(credential.accessKeyId, credential.secretAccessKey);

  return credential;
};

// IAM answers a delete for a key that is already gone with 404, which the real providers treat
// as success since revocation is the desired end state. That matters in replace-in-place mode,
// where the credential the service offers for revocation died when the next one was published.
const $deleteKey = (accessKeyId: string) => {
  state.keys.delete(accessKeyId);
};

export const awsIamUserSecretRotationFactory: TRotationFactory<
  TAwsIamUserSecretRotationWithConnection,
  TAwsIamUserSecretRotationGeneratedCredentials
> = (secretRotation) => {
  const { secretsMapping } = secretRotation;

  const issueCredentials: TRotationFactoryIssueCredentials<TAwsIamUserSecretRotationGeneratedCredentials> = async (
    callback
  ) => callback($createKey());

  const rotateCredentials: TRotationFactoryRotateCredentials<TAwsIamUserSecretRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback,
    activeCredentials
  ) => {
    const credentials = $createKey();

    if (state.mode === FakeIamRotationMode.ReplaceInPlace) {
      // The credential being published replaces the live one, so the credential users hold stops
      // working the moment this returns. Nothing is left to retire later.
      $deleteKey(activeCredentials.accessKeyId);
    } else if (credentialsToRevoke) {
      $deleteKey(credentialsToRevoke.accessKeyId);
    }

    const rotation = await callback(credentials);

    if (state.afterPersistError) throw new BadRequestError({ message: state.afterPersistError });

    return rotation;
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TAwsIamUserSecretRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    credentials.forEach(({ accessKeyId }) => $deleteKey(accessKeyId));

    return callback();
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TAwsIamUserSecretRotationGeneratedCredentials> = (
    credentials
  ) => [
    { key: secretsMapping.accessKeyId, value: credentials.accessKeyId },
    { key: secretsMapping.secretAccessKey, value: credentials.secretAccessKey }
  ];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TAwsIamUserSecretRotationGeneratedCredentials
  > = ({ accessKeyId, secretAccessKey }) => {
    if (state.keys.get(accessKeyId) !== secretAccessKey) {
      throw new BadRequestError({ message: `Unable to validate credentials: the access key ${accessKeyId} is gone` });
    }

    return Promise.resolve();
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};

// Nothing forces a module replaced by an alias to match the module it replaces, so a signature
// change in the real provider would otherwise leave this fake quietly wrong. This assignment
// fails type-checking instead.
export const assertFakeMatchesRealProvider: Pick<typeof RealProvider, "awsIamUserSecretRotationFactory"> = {
  awsIamUserSecretRotationFactory
};
