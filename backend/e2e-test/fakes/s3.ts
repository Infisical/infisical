import type * as RealS3 from "../../src/lib/aws/s3";

// Stands in for the S3 bucket helper so the specs can drive uploads and downloads through presigned
// links without reaching AWS. Wired up by test.alias in vitest.e2e.config.mts; nothing under src/
// references this file.
//
// It keeps the two rules the real links sign and S3 enforces: the body is the declared size, and an
// upload never overwrites an object already stored. The SHA-256 is not checked, because the specs
// upload filler bytes against a fixed digest.

type TAccessFailure = "unreachable" | "unwritable";

type TFakeState = {
  objects: Map<string, Buffer>;
  accessFailure: TAccessFailure | null;
  presignedPuts: Map<string, { bucket: string; key: string; contentLength: number }>;
  presignedGets: Map<string, { bucket: string; key: string }>;
  nextUrlId: number;
};

const freshState = (): TFakeState => ({
  objects: new Map(),
  accessFailure: null,
  presignedPuts: new Map(),
  presignedGets: new Map(),
  nextUrlId: 0
});

// On globalThis for the same reason as the Parameter Store fake: the server and a spec can reach this
// module by different specifiers, and module state would then split into two copies.
const globalScope = globalThis as typeof globalThis & { infisicalFakeS3Bucket?: TFakeState };
globalScope.infisicalFakeS3Bucket ??= freshState();
const state = globalScope.infisicalFakeS3Bucket;

const objectId = (bucket: string, key: string) => `${bucket}/${key}`;

export const fakeS3Bucket = {
  reset: () => {
    Object.assign(state, freshState());
  },

  // Make checkAccess fail the way a bucket that can't be reached, or can't be written to, would.
  // Pass null to go back to accepting.
  failsAccessCheckWith: (failure: TAccessFailure | null) => {
    state.accessFailure = failure;
  },

  put: (url: string, body: Buffer) => {
    const target = state.presignedPuts.get(url);
    if (!target) throw new Error(`No presigned PUT was minted for ${url}`);
    if (body.length !== target.contentLength) {
      throw new Error(`Presigned PUT expects ${target.contentLength} bytes, got ${body.length}`);
    }
    const id = objectId(target.bucket, target.key);
    if (state.objects.has(id)) {
      throw new Error(`Presigned PUT is create-only, and ${target.key} already exists`);
    }
    state.objects.set(id, body);
  },

  get: (url: string) => {
    const target = state.presignedGets.get(url);
    if (!target) throw new Error(`No presigned GET was minted for ${url}`);
    return state.objects.get(objectId(target.bucket, target.key)) ?? null;
  },

  objectKeys: (bucket: string) =>
    [...state.objects.keys()]
      .filter((id) => id.startsWith(`${bucket}/`))
      .map((id) => id.slice(bucket.length + 1))
      .sort()
};

export const createS3Bucket = ({ bucket }: Parameters<typeof RealS3.createS3Bucket>[0]) => {
  // The key is in the path, as on a real presigned link, so a spec can tell which object a link is for.
  const mintUrl = (kind: string, key: string) => {
    state.nextUrlId += 1;
    return `https://${bucket}.s3.fake.local/${key}?x-fake-link=${kind}-${state.nextUrlId}`;
  };

  return {
    presignCreateOnlyPut: ({ key, contentLength }: { key: string; contentLength: number }) => {
      const url = mintUrl("put", key);
      state.presignedPuts.set(url, { bucket, key, contentLength });
      return Promise.resolve(url);
    },

    presignGet: (key: string) => {
      const url = mintUrl("get", key);
      state.presignedGets.set(url, { bucket, key });
      return Promise.resolve(url);
    },

    checkAccess: (): Promise<RealS3.TS3AccessCheck> =>
      Promise.resolve(
        state.accessFailure
          ? { ok: false, failure: state.accessFailure, error: new Error(`fake bucket is ${state.accessFailure}`) }
          : { ok: true }
      )
  };
};

export { createS3Client } from "../../src/lib/aws/s3";

export const assertFakeMatchesRealS3: Pick<typeof RealS3, "createS3Bucket"> = { createS3Bucket };

export const assertFakeBucketShapeMatches: { [K in keyof RealS3.TS3Bucket]: unknown } = {
  presignCreateOnlyPut: null,
  presignGet: null,
  checkAccess: null
};
