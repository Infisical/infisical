import { BadRequestError } from "@app/lib/errors";

import type * as RealStorage from "../../src/ee/services/agent-vault-activity/agent-vault-activity-storage";
import {
  buildActivityObjectKey,
  buildSessionPrefix,
  normalizeKeyPrefix,
  resolveStorageConfig
} from "../../src/ee/services/agent-vault-activity/agent-vault-activity-storage";
import type { TResolvedActivityStorageConfig } from "../../src/ee/services/agent-vault-activity/agent-vault-activity-types";

/**
 * An in-memory S3 for the activity specs. Wired up by test.alias in vitest.e2e.config.mts on the
 * specifier "./agent-vault-activity-storage", which only the activity service and its sweep use, so the
 * proxy service keeps the real (pure) resolveStorageConfig. Nothing under src/ references this file.
 *
 * The pure exports are re-exported from the real module by a path that is not itself aliased, so key
 * layout, prefix normalisation and config resolution stay under test rather than reimplemented here.
 */
export { buildActivityObjectKey, buildSessionPrefix, normalizeKeyPrefix, resolveStorageConfig };

type TFakeState = {
  // Keyed by `${bucket}/${objectKey}`, so repointing at a second bucket makes the first one's objects
  // unreachable exactly as it would in AWS.
  objects: Map<string, Buffer>;
  validateError: string | null;
  presignError: string | null;
  deleteError: string | null;
  presignedPuts: Map<string, { bucket: string; objectKey: string; ciphertextBytes: number }>;
  presignedGets: Map<string, { bucket: string; objectKey: string }>;
  nextUrlId: number;
};

const freshState = (): TFakeState => ({
  objects: new Map(),
  validateError: null,
  presignError: null,
  deleteError: null,
  presignedPuts: new Map(),
  presignedGets: new Map(),
  nextUrlId: 0
});

// Shared through globalThis for the same reason as the AWS connection fake: the alias makes this
// module reachable by more than one specifier, so it can be instantiated twice, and a spec would then
// configure a copy the server never reads.
const globalScope = globalThis as typeof globalThis & { infisicalFakeActivityStorage?: TFakeState };
globalScope.infisicalFakeActivityStorage ??= freshState();
const state = globalScope.infisicalFakeActivityStorage;

const objectId = (bucket: string, objectKey: string) => `${bucket}/${objectKey}`;

export const fakeActivityStorage = {
  reset: () => {
    Object.assign(state, freshState());
  },

  /** Make saving settings reject, the way an unreachable bucket or a missing s3:PutObject does. */
  failsValidationWith: (message: string | null) => {
    state.validateError = message;
  },

  /** Make minting a presigned URL throw, which is the AWS failure the write path reports as a 500. */
  failsPresignWith: (message: string | null) => {
    state.presignError = message;
  },

  /** Make the sweep's object deletion throw, so a spec can assert the rows survive. */
  failsDeleteWith: (message: string | null) => {
    state.deleteError = message;
  },

  /** The upload a proxy performs against a presigned PUT url. */
  put: (url: string, body: Buffer) => {
    const target = state.presignedPuts.get(url);
    if (!target) throw new Error(`No presigned PUT was minted for ${url}`);
    if (body.length !== target.ciphertextBytes) {
      // The real presign signs ContentLength in, so S3 refuses a body of any other size.
      throw new Error(`Presigned PUT expects ${target.ciphertextBytes} bytes, got ${body.length}`);
    }
    state.objects.set(objectId(target.bucket, target.objectKey), body);
  },

  /** The download the browser performs against a presigned GET url. */
  get: (url: string) => {
    const target = state.presignedGets.get(url);
    if (!target) throw new Error(`No presigned GET was minted for ${url}`);
    return state.objects.get(objectId(target.bucket, target.objectKey)) ?? null;
  },

  objectKeys: (bucket: string) =>
    [...state.objects.keys()]
      .filter((id) => id.startsWith(`${bucket}/`))
      .map((id) => id.slice(bucket.length + 1))
      .sort()
};

// orgId is kept so the fake's signature stays parallel to the real module's, which is what makes a
// drift in the real one obvious here. The fake has no tenant to scope to, so it never reads it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const buildActivityStorage = (config: TResolvedActivityStorageConfig, _orgId: string) => {
  const { bucket, keyPrefix } = config;

  const mintUrl = (kind: string) => {
    state.nextUrlId += 1;
    return `https://${bucket}.s3.fake.local/${kind}/${state.nextUrlId}`;
  };

  return Promise.resolve({
    presignPut: ({ objectKey, ciphertextBytes }: { objectKey: string; ciphertextBytes: number }) => {
      if (state.presignError) throw new Error(state.presignError);
      const url = mintUrl("put");
      state.presignedPuts.set(url, { bucket, objectKey, ciphertextBytes });
      return Promise.resolve(url);
    },

    presignGet: (objectKey: string) => {
      if (state.presignError) throw new Error(state.presignError);
      const url = mintUrl("get");
      state.presignedGets.set(url, { bucket, objectKey });
      return Promise.resolve(url);
    },

    mintCorsProbeUrl: () => {
      const url = mintUrl("cors-probe");
      state.presignedGets.set(url, { bucket, objectKey: `${normalizeKeyPrefix(keyPrefix)}.cors-probe` });
      return Promise.resolve(url);
    },

    validate: () => {
      if (state.validateError) {
        // Same error class as the real module, so a spec can assert the status and the message.
        throw new BadRequestError({ message: state.validateError });
      }
      return Promise.resolve();
    },

    deletePrefix: (prefix: string) => {
      if (state.deleteError) throw new Error(state.deleteError);
      let deleted = 0;
      for (const id of [...state.objects.keys()]) {
        if (id.startsWith(objectId(bucket, prefix))) {
          state.objects.delete(id);
          deleted += 1;
        }
      }
      return Promise.resolve(deleted);
    }
  });
};

/**
 * Nothing forces an aliased module to match the one it replaces, so a signature change in the real
 * storage module would otherwise leave this fake quietly wrong. These assignments fail type-checking
 * instead. buildActivityStorage's third parameter is the dependency bag, which the fake ignores, so it
 * is checked by shape rather than by identity.
 */
export const assertFakeMatchesRealStorage: Pick<
  typeof RealStorage,
  "buildActivityObjectKey" | "buildSessionPrefix" | "normalizeKeyPrefix" | "resolveStorageConfig"
> = {
  buildActivityObjectKey,
  buildSessionPrefix,
  normalizeKeyPrefix,
  resolveStorageConfig
};

export const assertFakeStorageShapeMatches: {
  [K in keyof RealStorage.TAgentVaultActivityStorage]: unknown;
} = {
  presignPut: null,
  presignGet: null,
  mintCorsProbeUrl: null,
  validate: null,
  deletePrefix: null
};
