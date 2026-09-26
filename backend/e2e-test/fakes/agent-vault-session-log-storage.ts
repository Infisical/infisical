import { BadRequestError } from "@app/lib/errors";

import type * as RealStorage from "../../src/ee/services/agent-vault-session-log/agent-vault-session-log-storage";
import {
  buildSessionLogObjectKey,
  resolveStorageConfig,
  withKeyPrefix
} from "../../src/ee/services/agent-vault-session-log/agent-vault-session-log-storage";
import type { TResolvedSessionLogStorageConfig } from "../../src/ee/services/agent-vault-session-log/agent-vault-session-log-types";

export { buildSessionLogObjectKey, resolveStorageConfig, withKeyPrefix };

type TFakeState = {
  objects: Map<string, Buffer>;
  validateError: string | null;
  presignError: string | null;
  buildError: string | null;
  presignedPuts: Map<string, { bucket: string; objectKey: string; ciphertextBytes: number }>;
  presignedGets: Map<string, { bucket: string; objectKey: string }>;
  nextUrlId: number;
};

const freshState = (): TFakeState => ({
  objects: new Map(),
  validateError: null,
  presignError: null,
  buildError: null,
  presignedPuts: new Map(),
  presignedGets: new Map(),
  nextUrlId: 0
});

const globalScope = globalThis as typeof globalThis & { infisicalFakeSessionLogStorage?: TFakeState };
globalScope.infisicalFakeSessionLogStorage ??= freshState();
const state = globalScope.infisicalFakeSessionLogStorage;

const objectId = (bucket: string, objectKey: string) => `${bucket}/${objectKey}`;

export const fakeSessionLogStorage = {
  reset: () => {
    Object.assign(state, freshState());
  },

  failsValidationWith: (message: string | null) => {
    state.validateError = message;
  },

  failsPresignWith: (message: string | null) => {
    state.presignError = message;
  },

  failsBuildWith: (message: string | null) => {
    state.buildError = message;
  },

  put: (url: string, body: Buffer) => {
    const target = state.presignedPuts.get(url);
    if (!target) throw new Error(`No presigned PUT was minted for ${url}`);
    if (body.length !== target.ciphertextBytes) {
      throw new Error(`Presigned PUT expects ${target.ciphertextBytes} bytes, got ${body.length}`);
    }
    const id = objectId(target.bucket, target.objectKey);
    if (state.objects.has(id)) {
      throw new Error(`Presigned PUT is create-only, and ${target.objectKey} already exists`);
    }
    state.objects.set(id, body);
  },

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const buildSessionLogStorage = (config: TResolvedSessionLogStorageConfig, _orgId: string) => {
  if (state.buildError) return Promise.reject(new BadRequestError({ message: state.buildError }));
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
      state.presignedGets.set(url, { bucket, objectKey: withKeyPrefix(keyPrefix, ".cors-probe") });
      return Promise.resolve(url);
    },

    validate: () => {
      if (state.validateError) {
        throw new BadRequestError({ message: state.validateError });
      }
      return Promise.resolve();
    }
  });
};

export const assertFakeMatchesRealStorage: Pick<
  typeof RealStorage,
  "buildSessionLogObjectKey" | "resolveStorageConfig" | "withKeyPrefix"
> = {
  buildSessionLogObjectKey,
  resolveStorageConfig,
  withKeyPrefix
};

export const assertFakeStorageShapeMatches: {
  [K in keyof RealStorage.TAgentVaultSessionLogStorage]: unknown;
} = {
  presignPut: null,
  presignGet: null,
  mintCorsProbeUrl: null,
  validate: null
};
