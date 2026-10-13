import { S3ServiceException } from "@aws-sdk/client-s3";

import type * as RealS3 from "../../src/lib/aws/s3";

// Stands in for the S3 bucket helper so the specs can drive uploads and downloads through presigned
// links without reaching AWS. Wired up by test.alias in vitest.e2e.config.mts; nothing under src/
// references this file.
//
// It keeps the two rules the real links sign and S3 enforces: the body is the declared size, and an
// upload never overwrites an object already stored. The SHA-256 is not checked, because the specs
// upload filler bytes against a fixed digest. Listing follows S3: names in binary order, after
// StartAfter, at most MaxKeys, with IsTruncated when more remain.

type TAccessFailure = "unreachable" | "unwritable";

type TFakeState = {
  objects: Map<string, Buffer>;
  accessFailure: TAccessFailure | null;
  isListFailing: boolean;
  presignedPuts: Map<string, { bucket: string; key: string; contentLength: number }>;
  presignedGets: Map<string, { bucket: string; key: string }>;
  nextUrlId: number;
};

const freshState = (): TFakeState => ({
  objects: new Map(),
  accessFailure: null,
  isListFailing: false,
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

  // Make listPage fail the way S3 does when the role can't list the bucket.
  failsListWith: (isFailing: boolean) => {
    state.isListFailing = isFailing;
  },

  // Store an object no link was minted for, as someone with access to the bucket could.
  putDirect: (bucket: string, key: string, body: Buffer) => {
    state.objects.set(objectId(bucket, key), body);
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

    listPage: ({ prefix, startAfter, maxKeys }: { prefix: string; startAfter?: string; maxKeys: number }) => {
      if (state.isListFailing) {
        return Promise.reject(
          new S3ServiceException({ name: "AccessDenied", $fault: "client", $metadata: {}, message: "Access Denied" })
        );
      }
      const matching = [...state.objects.entries()]
        .filter(([id]) => id.startsWith(`${bucket}/`))
        .map(([id, body]) => ({ key: id.slice(bucket.length + 1), size: body.length }))
        .filter(({ key }) => key.startsWith(prefix) && (startAfter === undefined || key > startAfter))
        .sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
      return Promise.resolve({ objects: matching.slice(0, maxKeys), isTruncated: matching.length > maxKeys });
    },

    checkReachable: (): Promise<{ ok: true } | { ok: false; error: unknown }> =>
      Promise.resolve(
        state.accessFailure === "unreachable"
          ? { ok: false, error: new Error("fake bucket is unreachable") }
          : { ok: true }
      ),

    checkAccess: (): Promise<RealS3.TS3AccessCheck> =>
      Promise.resolve(
        state.accessFailure
          ? { ok: false, failure: state.accessFailure, error: new Error(`fake bucket is ${state.accessFailure}`) }
          : { ok: true }
      )
  };
};

export const assertFakeMatchesRealS3: Pick<typeof RealS3, "createS3Bucket"> = { createS3Bucket };

export const assertFakeBucketShapeMatches: { [K in keyof RealS3.TS3Bucket]: unknown } = {
  presignCreateOnlyPut: null,
  presignGet: null,
  listPage: null,
  checkReachable: null,
  checkAccess: null
};
