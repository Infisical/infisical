import { createHash, createPublicKey } from "node:crypto";

import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { createS3Bucket } from "@app/lib/aws/s3";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsKeyUsage } from "@app/services/kms/kms-types";

import { TPamSessionServiceFactory } from "../pam-session/pam-session-service";
import { TPamWebAppSessionDAL } from "../pam-web-app-session/pam-web-app-session-dal";
import {
  PAM_RECORDING_MANIFEST_TABLE,
  PAM_WEB_APP_SESSION_TABLE,
  TWebAppRecord
} from "../pam-web-app-session/pam-web-app-session-types";
import { resolveS3RecordingAccess } from "./aws-s3/aws-s3-provider-factory";
import { PAM_RECORDING_MAX_CHUNK_BYTES, PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS } from "./pam-recording-constants";
import { PamRecordingStorageBackend } from "./pam-recording-enums";
import { decryptSessionKey, verifyGatewayUploadToken } from "./pam-recording-secrets";
import { buildExternalChunkObjectKey } from "./pam-recording-storage-types";
import {
  assessWebRecording,
  canonicalizeRecording,
  immutableRecordingChunkMatches,
  TCanonicalJson,
  TWebRecordingChunk,
  TWebRecordingFinal,
  verifyRecordingSignature
} from "./pam-web-recording-fns";

type TManifest = {
  sessionId: string;
  version: number;
  canonical: TCanonicalJson;
  canonicalSha256: Buffer;
  signature: Buffer | null;
  signingKeyId: string | null;
  alg: string | null;
  signaturePendingUntil: Date | null;
  status: "complete" | "incomplete" | "mismatch";
  statusDetail: string | null;
  finalizedAt: Date;
};
type TStoredChunk = TWebRecordingChunk & { id: string; sessionId: string; encryptedEventsBlob: Buffer | null };
type TDeps = {
  dal: TPamWebAppSessionDAL;
  kmsService: Pick<
    TKmsServiceFactory,
    "createCipherPairWithDataKey" | "generateKmsKey" | "getPublicKey" | "signWithKmsKey"
  >;
  kmsDAL: Pick<TKmsKeyDALFactory, "find" | "transaction">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  pamSessionService: Pick<TPamSessionServiceFactory, "getSessionById">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};
const signingAlgorithm = SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256;
export const meaningfulObjectVersion = (version?: string | null) => (version && version !== "null" ? version : null);
export type TPamWebRecordingService = ReturnType<typeof pamWebRecordingServiceFactory>;
export const pamWebRecordingServiceFactory = ({
  dal,
  kmsService,
  kmsDAL,
  keyStore,
  appConnectionDAL,
  pamSessionService,
  auditLogService
}: TDeps) => {
  const getRecord = async (sessionId: string, actor: OrgServiceActor) => {
    const record = await dal.getRecord(sessionId);
    if (!record || record.session.orgId !== actor.orgId)
      throw new NotFoundError({ message: "Browser session not found" });
    return record;
  };
  const authorizeGateway = async (sessionId: string, uploadToken: string, actor: OrgServiceActor) => {
    const record = await getRecord(sessionId, actor);
    if (actor.type !== ActorType.GATEWAY || record.web.gatewayId !== actor.id)
      throw new ForbiddenRequestError({ message: "Gateway not authorized for this browser session" });
    verifyGatewayUploadToken(uploadToken, record.session.gatewayUploadTokenHash);
    return record;
  };
  const audit = (
    record: TWebAppRecord,
    type:
      | EventType.PAM_SESSION_RECORDING_CHUNK_CONFLICT
      | EventType.PAM_SESSION_RECORDING_LATE_UPLOAD_REJECTED
      | EventType.PAM_SESSION_RECORDING_FINALIZED
      | EventType.PAM_SESSION_RECORDING_VIEWED,
    extra: { chunkIndex?: number; status?: string } = {},
    info?: AuditLogInfo
  ) =>
    auditLogService.createAuditLog({
      ...(info ?? { actor: { type: ActorType.PLATFORM as const, metadata: {} } }),
      orgId: record.session.orgId,
      projectId: record.session.projectId,
      event: {
        type,
        metadata: { sessionId: record.session.id, accountId: record.web.accountId ?? undefined, ...extra }
      }
    });
  const storageForSession = async (record: TWebAppRecord) => {
    const snapshot = await dal.getStorage(record.session.id);
    if (!snapshot) throw new NotFoundError({ message: "The recording storage snapshot is missing" });
    if (snapshot.backend === PamRecordingStorageBackend.Postgres) return { snapshot, bucket: null };
    if (!snapshot.connectionId || !snapshot.bucket)
      throw new BadRequestError({ message: "The session recording storage is incomplete" });
    const connection = await appConnectionDAL.findById(snapshot.connectionId, dal.db);
    if (!connection || connection.orgId !== record.session.orgId)
      throw new NotFoundError({ message: "The session recording storage connection is unavailable" });
    const access = await resolveS3RecordingAccess(
      await decryptAppConnection(connection, kmsService),
      snapshot.region ?? undefined
    );
    if (!access.region || !access.awsCredentials)
      throw new BadRequestError({ message: "The recording storage credentials are unavailable" });
    const bucket = createS3Bucket({
      bucket: snapshot.bucket,
      region: access.region,
      credentials: access.awsCredentials,
      endpoint: access.endpoint,
      httpsAgent: await access.getHttpsAgent?.()
    });
    return { snapshot, bucket };
  };
  const listSigningKeys = (orgId: string) =>
    kmsDAL.transaction(async (tx) => {
      const keys = await kmsDAL.find(
        { orgId, projectId: null, isReserved: true, keyUsage: KmsKeyUsage.SIGN_VERIFY },
        { sort: [["createdAt", "asc"]], tx }
      );
      return keys.filter((key) => key.name === "pam-recording-signer" || key.name.startsWith("pam-recording-signer-"));
    });
  const publicKeyPem = async (kmsId: string) =>
    createPublicKey({ key: await kmsService.getPublicKey({ kmsId }), format: "der", type: "spki" })
      .export({ type: "spki", format: "pem" })
      .toString();
  const signCanonical = async (orgId: string, canonical: TCanonicalJson) => {
    let [key] = await listSigningKeys(orgId);
    if (!key) {
      const lock = await keyStore.acquireLock([`pam-recording-signer:${orgId}`], 120_000, {
        retryCount: 20,
        retryDelay: 500
      });
      try {
        [key] = await listSigningKeys(orgId);
        if (!key)
          key = await kmsService.generateKmsKey({
            orgId,
            name: "pam-recording-signer",
            keyUsage: KmsKeyUsage.SIGN_VERIFY,
            encryptionAlgorithm: AsymmetricKeyAlgorithm.RSA_4096,
            isReserved: true,
            isExportable: false,
            hasDeleteProtection: true
          });
      } finally {
        await lock.release();
      }
    }
    const sign = await kmsService.signWithKmsKey({ kmsId: key.id });
    const signed = await sign({
      data: Buffer.from(canonicalizeRecording(canonical)),
      signingAlgorithm,
      isDigest: false
    });
    return { signature: signed.signature, signingKeyId: key.id, alg: signed.algorithm };
  };
  const requestPresignedPut = async (
    {
      sessionId,
      chunkIndex,
      ciphertextBytes,
      ciphertextSha256Base64,
      uploadToken
    }: {
      sessionId: string;
      chunkIndex: number;
      ciphertextBytes: number;
      ciphertextSha256Base64?: string;
      uploadToken: string;
    },
    actor: OrgServiceActor
  ) => {
    const record = await authorizeGateway(sessionId, uploadToken, actor);
    if (
      !ciphertextSha256Base64 ||
      Buffer.from(ciphertextSha256Base64, "base64").length !== 32 ||
      Buffer.from(ciphertextSha256Base64, "base64").toString("base64") !== ciphertextSha256Base64
    )
      throw new BadRequestError({ message: "A SHA-256 checksum is required for Web App recording uploads" });
    const { snapshot, bucket } = await storageForSession(record);
    if (!bucket) throw new BadRequestError({ message: "Upload this session recording inline" });
    const objectKey = buildExternalChunkObjectKey(
      snapshot.keyPrefix,
      record.session.projectId,
      sessionId,
      chunkIndex,
      false
    );
    let existing: Awaited<ReturnType<typeof bucket.headObject>> | undefined;
    try {
      existing = await bucket.headObject(objectKey);
    } catch (error) {
      const cause = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (cause.$metadata?.httpStatusCode !== 404 && cause.name !== "NotFound" && cause.name !== "NoSuchKey")
        throw new BadRequestError({
          message: "Recording storage could not inspect this chunk. Check its read permissions and try again."
        });
    }
    if (existing) {
      if (existing.ContentLength !== ciphertextBytes || existing.ChecksumSHA256 !== ciphertextSha256Base64) {
        await audit(record, EventType.PAM_SESSION_RECORDING_CHUNK_CONFLICT, { chunkIndex });
        throw new ConflictError({ message: "A different object already exists for this chunk" });
      }
      return { alreadyUploaded: true as const, objectVersionId: meaningfulObjectVersion(existing.VersionId) };
    }
    const url = await bucket.presignCreateOnlyPut({
      key: objectKey,
      contentLength: ciphertextBytes,
      sha256Base64: ciphertextSha256Base64,
      expiresInSeconds: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS
    });
    return {
      url,
      objectKey,
      method: "PUT" as const,
      expiresInSeconds: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS,
      alreadyUploaded: false as const,
      headers: {
        "x-amz-checksum-sha256": ciphertextSha256Base64,
        "If-None-Match": "*",
        "Content-Length": String(ciphertextBytes)
      }
    };
  };
  const lockRecording = (sessionId: string, tx: Knex) =>
    tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [sessionId]);
  const recordChunk = async (
    input: {
      sessionId: string;
      chunkIndex: number;
      startElapsedMs: number;
      endElapsedMs: number;
      ciphertextSha256Base64: string;
      ciphertextBytes: number;
      ivBase64: string;
      ciphertext?: Buffer;
      objectVersionId?: string;
      uploadToken: string;
    },
    actor: OrgServiceActor
  ) => {
    const record = await authorizeGateway(input.sessionId, input.uploadToken, actor);
    const { snapshot, bucket } = await storageForSession(record);
    const digest = Buffer.from(input.ciphertextSha256Base64, "base64");
    const iv = Buffer.from(input.ivBase64, "base64");
    if (
      digest.length !== 32 ||
      digest.toString("base64") !== input.ciphertextSha256Base64 ||
      iv.length !== 12 ||
      iv.toString("base64") !== input.ivBase64
    )
      throw new BadRequestError({ message: "The recording checksum or IV is invalid" });
    if (
      input.ciphertextBytes < 1 ||
      input.ciphertextBytes > PAM_RECORDING_MAX_CHUNK_BYTES ||
      input.endElapsedMs < input.startElapsedMs
    )
      throw new BadRequestError({ message: "The recording chunk size or time interval is invalid" });
    const objectKey = bucket
      ? buildExternalChunkObjectKey(
          snapshot.keyPrefix,
          record.session.projectId,
          input.sessionId,
          input.chunkIndex,
          false
        )
      : null;
    let objectVersionId = bucket ? meaningfulObjectVersion(input.objectVersionId) : null;
    const candidate: TWebRecordingChunk = {
      chunkIndex: input.chunkIndex,
      ciphertextSha256: digest,
      ciphertextBytes: input.ciphertextBytes,
      iv,
      startElapsedMs: input.startElapsedMs,
      endElapsedMs: input.endElapsedMs,
      storageBackend: snapshot.backend,
      externalChunkObjectKey: objectKey,
      externalObjectVersionId: objectVersionId
    };
    const rejected = async (kind: "late" | "conflict") => {
      await audit(
        record,
        kind === "late"
          ? EventType.PAM_SESSION_RECORDING_LATE_UPLOAD_REJECTED
          : EventType.PAM_SESSION_RECORDING_CHUNK_CONFLICT,
        { chunkIndex: input.chunkIndex }
      );
      throw new ConflictError({
        message:
          kind === "late"
            ? "This recording is sealed and cannot accept new or changed chunks"
            : "This recording chunk was already uploaded with different contents or metadata"
      });
    };
    if (
      !bucket &&
      (!input.ciphertext ||
        input.ciphertext.length !== input.ciphertextBytes ||
        !createHash("sha256").update(input.ciphertext).digest().equals(digest))
    )
      throw new BadRequestError({ message: "The recording ciphertext does not match its declared size and checksum" });
    const preflight = await dal.transaction(async (tx) => {
      await lockRecording(input.sessionId, tx);
      const existing = await tx<TStoredChunk>(TableName.PamSessionEventChunk)
        .where({ sessionId: input.sessionId, chunkIndex: input.chunkIndex })
        .first();
      if (existing && immutableRecordingChunkMatches(existing, candidate)) return "identical";
      if (await tx(PAM_RECORDING_MANIFEST_TABLE).where({ sessionId: input.sessionId }).first()) return "late";
      return existing ? "conflict" : "verify";
    });
    if (preflight === "late" || preflight === "conflict") return rejected(preflight);
    const receipt = {
      ok: true as const,
      projectId: record.session.projectId,
      accountId: record.web.accountId,
      storageBackend: snapshot.backend
    };
    if (preflight === "identical") return receipt;
    if (bucket) {
      let head: Awaited<ReturnType<typeof bucket.headObject>>;
      try {
        head = await bucket.headObject(objectKey!, meaningfulObjectVersion(input.objectVersionId) ?? undefined);
      } catch {
        throw new BadRequestError({
          message:
            "The stored recording chunk could not be inspected. Check its object version and storage read permissions."
        });
      }
      objectVersionId = meaningfulObjectVersion(head.VersionId);
      if (objectVersionId && input.objectVersionId !== objectVersionId)
        throw new BadRequestError({ message: "Provide the exact object version returned by recording storage" });
      if (head.ContentLength !== input.ciphertextBytes || head.ChecksumSHA256 !== input.ciphertextSha256Base64)
        throw new BadRequestError({
          message: "The stored recording chunk does not match its declared size and checksum"
        });
    }
    const chunk: TWebRecordingChunk = {
      chunkIndex: input.chunkIndex,
      ciphertextSha256: digest,
      ciphertextBytes: input.ciphertextBytes,
      iv,
      startElapsedMs: input.startElapsedMs,
      endElapsedMs: input.endElapsedMs,
      storageBackend: snapshot.backend,
      externalChunkObjectKey: objectKey,
      externalObjectVersionId: objectVersionId,
      verifiedAt: new Date(),
      verifiedSha256: digest
    };
    const result = await dal.transaction(async (tx) => {
      await lockRecording(input.sessionId, tx);
      const existing = await tx<TStoredChunk>(TableName.PamSessionEventChunk)
        .where({ sessionId: input.sessionId, chunkIndex: input.chunkIndex })
        .first();
      if (existing && immutableRecordingChunkMatches(existing, chunk)) return "identical";
      const sealed = await tx<TManifest>(PAM_RECORDING_MANIFEST_TABLE).where({ sessionId: input.sessionId }).first();
      if (sealed) return "late";
      if (existing) return "conflict";
      await tx(TableName.PamSessionEventChunk)
        .insert({
          sessionId: input.sessionId,
          ...chunk,
          encryptedEventsBlob: bucket ? null : input.ciphertext,
          chunkSizeBytes: bucket ? input.ciphertextBytes : null
        })
        .onConflict(["sessionId", "chunkIndex"])
        .ignore()
        .returning("id");
      return "created";
    });
    if (result === "conflict" || result === "late") return rejected(result);
    return receipt;
  };
  const recordFinal = async (
    sessionId: string,
    final: TWebRecordingFinal,
    uploadToken: string,
    actor: OrgServiceActor
  ) => {
    await authorizeGateway(sessionId, uploadToken, actor);
    await dal.transaction(async (tx) => {
      const record = await dal.lockRecord(sessionId, tx);
      if (!record) throw new NotFoundError({ message: "Browser session not found" });
      if (record.web.recordingFinalReport) {
        if (
          canonicalizeRecording(record.web.recordingFinalReport as unknown as TCanonicalJson) !==
          canonicalizeRecording(final as unknown as TCanonicalJson)
        )
          throw new ConflictError({
            message: "The recording final report was already submitted with different details"
          });
        return;
      }
      await tx(PAM_WEB_APP_SESSION_TABLE)
        .where({ sessionId })
        .update({ recordingFinalReport: JSON.stringify(final), chunksEmitted: final.chunksEmitted });
    });
  };
  const manifestView = (manifest: TManifest) => ({
    status: manifest.status,
    statusDetail: manifest.statusDetail,
    canonicalSha256: manifest.canonicalSha256.toString("base64"),
    signature: manifest.signature?.toString("base64") ?? null,
    signingKeyId: manifest.signingKeyId,
    alg: manifest.alg,
    finalizedAt: manifest.finalizedAt
  });
  const finalize = async (
    {
      sessionId,
      chunkCount,
      lastEndElapsedMs,
      chainHeadBase64,
      endReason,
      uploadToken
    }: {
      sessionId: string;
      chunkCount: number;
      lastEndElapsedMs: number;
      chainHeadBase64: string;
      endReason: string;
      uploadToken: string;
    },
    actor: OrgServiceActor
  ) => {
    const record = await authorizeGateway(sessionId, uploadToken, actor);
    const snapshot = await dal.getStorage(sessionId);
    if (!snapshot || !record.web.recordingFinalReport)
      throw new BadRequestError({ message: "Submit the recording final report before finalizing this recording" });
    const expectedHead = Buffer.from(chainHeadBase64, "base64");
    if (expectedHead.length !== 32 || expectedHead.toString("base64") !== chainHeadBase64)
      throw new BadRequestError({ message: "The final recording chain checksum is invalid" });
    if (lastEndElapsedMs !== record.web.recordingFinalReport.lastEndElapsedMs)
      throw new ConflictError({ message: "The final recording duration differs from its terminal report" });
    let manifest = await dal.transaction(async (tx) => {
      await lockRecording(sessionId, tx);
      const existing = await tx<TManifest>(PAM_RECORDING_MANIFEST_TABLE).where({ sessionId }).first();
      if (existing) {
        const canonical = existing.canonical as {
          reportedChunkCount: number;
          reportedChainHead: string;
          endReason: string;
          recordingFinal: { lastEndElapsedMs: number };
        };
        if (
          canonical.reportedChunkCount !== chunkCount ||
          canonical.recordingFinal.lastEndElapsedMs !== lastEndElapsedMs ||
          canonical.endReason !== endReason ||
          canonical.reportedChainHead !== chainHeadBase64
        )
          throw new ConflictError({ message: "This recording was already finalized with different details" });
        return existing;
      }
      const chunks = await dal.getRecordingChunkMetadata(sessionId, tx);
      const current = await dal.getRecord(sessionId, tx);
      if (!current?.web.recordingFinalReport)
        throw new BadRequestError({ message: "The recording final report is missing" });
      const assessment = assessWebRecording({
        chunks,
        final: current.web.recordingFinalReport,
        stopConfirmedAt: current.web.stopConfirmedAt,
        expectedChunkCount: chunkCount,
        expectedChainHead: expectedHead
      });
      const finalizedAt = new Date();
      const canonical: TCanonicalJson = {
        v: 1,
        format: "pam-web-events-v1",
        sessionId,
        projectId: record.session.projectId,
        orgId: record.session.orgId,
        accountId: record.web.accountId,
        allocationGen: record.web.allocationGen,
        reportedChainHead: chainHeadBase64,
        reportedChunkCount: chunkCount,
        storage: {
          backend: snapshot.backend,
          ...(snapshot.bucket ? { bucket: snapshot.bucket } : {}),
          ...(snapshot.region ? { region: snapshot.region } : {}),
          ...(snapshot.keyPrefix ? { keyPrefix: snapshot.keyPrefix } : {})
        },
        chunks: chunks.map((chunk) => ({
          i: chunk.chunkIndex,
          sha256: chunk.ciphertextSha256.toString("base64"),
          bytes: Number(chunk.ciphertextBytes),
          iv: chunk.iv.toString("base64"),
          startElapsedMs: Number(chunk.startElapsedMs),
          endElapsedMs: Number(chunk.endElapsedMs),
          ...(chunk.externalChunkObjectKey ? { objectKey: chunk.externalChunkObjectKey } : {}),
          ...(meaningfulObjectVersion(chunk.externalObjectVersionId)
            ? { versionId: chunk.externalObjectVersionId! }
            : {})
        })),
        chainHead: assessment.chainHead.toString("base64"),
        startedAt: record.session.startedAt?.toISOString() ?? null,
        endedAt: record.session.endedAt?.toISOString() ?? null,
        endReason,
        stopConfirmedAt: current.web.stopConfirmedAt?.toISOString() ?? null,
        recordingFinal: current.web.recordingFinalReport as unknown as TCanonicalJson,
        expectedChunkCount: chunkCount,
        status: assessment.status,
        protection: "participant-level",
        retentionLock: { verified: false },
        versionPinned:
          snapshot.backend === PamRecordingStorageBackend.AwsS3 &&
          chunks.length > 0 &&
          chunks.every((chunk) => Boolean(meaningfulObjectVersion(chunk.externalObjectVersionId))),
        finalizedAt: finalizedAt.toISOString()
      };
      const canonicalSha256 = createHash("sha256").update(canonicalizeRecording(canonical)).digest();
      const [created] = await tx<TManifest>(PAM_RECORDING_MANIFEST_TABLE)
        .insert({
          sessionId,
          version: 1,
          canonical: JSON.stringify(canonical) as unknown as TCanonicalJson,
          canonicalSha256,
          signaturePendingUntil: new Date(Date.now() + 300_000),
          status: assessment.status,
          statusDetail: assessment.statusDetail,
          finalizedAt
        })
        .returning("*");
      return created;
    });
    if (!manifest.signature) {
      const signed = await signCanonical(record.session.orgId, manifest.canonical);
      const [stored] = await dal
        .db<TManifest>(PAM_RECORDING_MANIFEST_TABLE)
        .where({ sessionId })
        .whereNull("signature")
        .update({ ...signed, signaturePendingUntil: null })
        .returning("*");
      manifest = stored ?? (await dal.db<TManifest>(PAM_RECORDING_MANIFEST_TABLE).where({ sessionId }).first())!;
    }
    await audit(record, EventType.PAM_SESSION_RECORDING_FINALIZED, { status: manifest.status });
    return { manifest: manifestView(manifest) };
  };
  const signingKeys = async (orgId: string) => ({
    keys: await Promise.all(
      (await listSigningKeys(orgId)).map(async (key) => ({
        id: key.id,
        alg: signingAlgorithm,
        publicKeyPem: await publicKeyPem(key.id),
        createdAt: key.createdAt
      }))
    )
  });
  const getPlayback = async (sessionId: string, actor: OrgServiceActor, verifyCursor = 0, info?: AuditLogInfo) => {
    const record = await getRecord(sessionId, actor);
    await pamSessionService.getSessionById(sessionId, {
      actor: actor.type,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod
    });
    if (!record.session.encryptedSessionKey)
      throw new NotFoundError({ message: "No recording is available for this session" });
    const sessionKey = await decryptSessionKey({
      projectId: record.session.projectId,
      sessionId,
      encryptedSessionKey: record.session.encryptedSessionKey,
      kmsService
    });
    const { snapshot, bucket } = await storageForSession(record);
    const chunks = await dal.getRecordingChunkMetadata(sessionId);
    const manifest = await dal.db<TManifest>(PAM_RECORDING_MANIFEST_TABLE).where({ sessionId }).first();
    let signatureVerified = false;
    if (manifest?.signature && manifest.signingKeyId)
      signatureVerified = verifyRecordingSignature(
        manifest.canonical,
        manifest.signature,
        await publicKeyPem(manifest.signingKeyId)
      );
    const currentPage = chunks.slice(verifyCursor, verifyCursor + 200);
    const availability = await Promise.all(
      currentPage.map(async (chunk) => {
        if (!bucket) return chunk.hasCiphertext;
        try {
          const head = await bucket.headObject(
            chunk.externalChunkObjectKey!,
            meaningfulObjectVersion(chunk.externalObjectVersionId) ?? undefined
          );
          return (
            head.ContentLength === Number(chunk.ciphertextBytes) &&
            head.ChecksumSHA256 === chunk.ciphertextSha256.toString("base64") &&
            meaningfulObjectVersion(head.VersionId) === meaningfulObjectVersion(chunk.externalObjectVersionId)
          );
        } catch {
          return false;
        }
      })
    );
    const playbackChunks: {
      chunkIndex: number;
      startElapsedMs: number;
      endElapsedMs: number;
      storageBackend: PamRecordingStorageBackend;
      externalChunkObjectKey: string | null;
      objectVersionId: string | null;
      ciphertextSha256: string;
      ciphertextBytes: number;
      iv: string;
      presignedGetUrl: string | null;
    }[] = [];
    for (let offset = 0; offset < chunks.length; offset += 100) {
      // Bound concurrent URL signing work without holding a transaction.
      // eslint-disable-next-line no-await-in-loop
      const batch = await Promise.all(
        chunks.slice(offset, offset + 100).map(async (chunk) => ({
          chunkIndex: chunk.chunkIndex,
          startElapsedMs: Number(chunk.startElapsedMs),
          endElapsedMs: Number(chunk.endElapsedMs),
          storageBackend: chunk.storageBackend as PamRecordingStorageBackend,
          externalChunkObjectKey: chunk.externalChunkObjectKey ?? null,
          objectVersionId: meaningfulObjectVersion(chunk.externalObjectVersionId),
          ciphertextSha256: chunk.ciphertextSha256.toString("base64"),
          ciphertextBytes: Number(chunk.ciphertextBytes),
          iv: chunk.iv.toString("base64"),
          presignedGetUrl:
            bucket && chunk.externalChunkObjectKey
              ? await bucket.presignGet(
                  chunk.externalChunkObjectKey,
                  PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS,
                  meaningfulObjectVersion(chunk.externalObjectVersionId) ?? undefined
                )
              : null
        }))
      );
      playbackChunks.push(...batch);
    }

    const expected = record.web.recordingFinalReport?.chunksEmitted ?? record.web.chunksEmitted;
    const indices = new Set(chunks.map((chunk) => chunk.chunkIndex));
    const missingIndices: number[] = [];
    for (let index = 0; index < expected && missingIndices.length < 100; index += 1)
      if (!indices.has(index)) missingIndices.push(index);
    await audit(record, EventType.PAM_SESSION_RECORDING_VIEWED, {}, info);
    return {
      sessionKey: sessionKey.toString("base64"),
      sessionComplete: ["stopped", "failed"].includes(record.web.workerState),
      projectId: record.session.projectId,
      storageBackend: snapshot.backend as PamRecordingStorageBackend,
      chunks: playbackChunks,
      manifest: manifest ? { ...manifestView(manifest), canonical: manifest.canonical } : null,
      coverage: {
        expectedChunks: expected,
        presentChunks: chunks.length,
        missingIndices,
        tailSealed: Boolean(manifest),
        gaps: record.web.recordingFinalReport?.gaps ?? []
      },
      integrity: {
        manifestStatus: manifest?.status ?? "pending",
        manifestSignatureVerified: signatureVerified,
        checkpointCount: 0
      },
      availability: {
        verifiedChunks: availability.filter(Boolean).length,
        checkedChunks: currentPage.length,
        verifyCursor: verifyCursor + 200 < chunks.length ? verifyCursor + 200 : null,
        storageBackend: snapshot.backend,
        protection: "participant-level" as const,
        retentionLock: "not-verified" as const,
        versionPinned:
          snapshot.backend === PamRecordingStorageBackend.AwsS3 &&
          chunks.length > 0 &&
          chunks.every((chunk) => Boolean(meaningfulObjectVersion(chunk.externalObjectVersionId)))
      }
    };
  };
  return { requestPresignedPut, recordChunk, recordFinal, finalize, signingKeys, getPlayback };
};
