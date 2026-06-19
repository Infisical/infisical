import RE2 from "re2";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { PamSessionStatus } from "../pam/pam-enums";
import { checkAccountAccess, TActorContext } from "../pam/pam-permission";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { PamTemplateSettingsSchema } from "../pam-account-template/pam-account-template-schemas";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { ResourcePermissionPamResourceActions } from "../permission/resource-permission";
import { TPamSessionEventChunkDALFactory } from "./pam-recording-chunk-dal";
import { PAM_RECORDING_MAX_CHUNK_BYTES } from "./pam-recording-constants";
import { PamRecordingStorageBackend } from "./pam-recording-enums";
import { decryptSessionKey, verifyGatewayUploadToken } from "./pam-recording-secrets";
import { PAM_RECORDING_STORAGE_FACTORY_MAP } from "./pam-recording-storage-factory";
import { buildExternalChunkObjectKey, TPamRecordingResolvedConfig } from "./pam-recording-storage-types";

type TPamSessionChunkServiceFactoryDep = {
  pamSessionDAL: TPamSessionDALFactory;
  pamSessionEventChunkDAL: TPamSessionEventChunkDALFactory;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails">;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
};

export type TPamSessionChunkServiceFactory = ReturnType<typeof pamSessionChunkServiceFactory>;

function assertGatewayActor(actor: OrgServiceActor) {
  if (actor.type !== ActorType.IDENTITY && actor.type !== ActorType.GATEWAY) {
    throw new ForbiddenRequestError({ message: "Only gateways can perform this action" });
  }
}

export const pamSessionChunkServiceFactory = ({
  pamSessionDAL,
  pamSessionEventChunkDAL,
  pamAccountDAL,
  permissionService,
  kmsService,
  appConnectionDAL
}: TPamSessionChunkServiceFactoryDep) => {
  const resolveRecordingConfig = async (accountId: string): Promise<TPamRecordingResolvedConfig | null> => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account) return null;

    const parsed = account.templateSettings ? PamTemplateSettingsSchema.safeParse(account.templateSettings) : null;
    const settings = parsed?.success ? parsed.data : null;
    if (!settings) return null;

    if (settings.recordingStorageBackend === PamRecordingStorageBackend.AwsS3) {
      const connectionId = account.recordingConnectionId;
      if (!connectionId || !settings.recordingS3Config) return null;

      const raw = await appConnectionDAL.findById(connectionId);
      if (!raw) {
        logger.warn({ connectionId, accountId }, `Recording app connection not found [connectionId=${connectionId}]`);
        return null;
      }

      const appConnection = await decryptAppConnection(raw, kmsService);
      const awsConfig = await getAwsConnectionConfig(
        appConnection as unknown as TAwsConnectionConfig,
        (settings.recordingS3Config.region as AWSRegion) ?? AWSRegion.US_EAST_1
      );

      return {
        backend: PamRecordingStorageBackend.AwsS3,
        bucket: settings.recordingS3Config.bucket,
        region: settings.recordingS3Config.region as AWSRegion,
        keyPrefix: settings.recordingS3Config.keyPrefix ?? null,
        awsCredentials: awsConfig.credentials
      };
    }

    return {
      backend: PamRecordingStorageBackend.Postgres,
      keyPrefix: null
    };
  };
  const checkSessionViewAccess = async (
    session: { accountId?: string | null; projectId: string },
    actor: OrgServiceActor
  ) => {
    if (!session.accountId) {
      throw new NotFoundError({ message: "Session has no associated account" });
    }

    const account = await pamAccountDAL.findByIdWithDetails(session.accountId);
    if (!account) {
      throw new NotFoundError({ message: "Account not found" });
    }

    const ctx: TActorContext = {
      actorId: actor.id,
      actor: actor.type,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod
    };

    await checkAccountAccess(
      permissionService,
      session.accountId,
      account.folderId,
      session.projectId,
      ResourcePermissionPamResourceActions.ViewSessions,
      ctx
    );
  };
  const requestPresignedPut = async (
    {
      sessionId,
      chunkIndex,
      ciphertextBytes,
      isKeyframe,
      uploadToken
    }: {
      sessionId: string;
      chunkIndex: number;
      ciphertextBytes: number;
      isKeyframe?: boolean;
      uploadToken: string;
    },
    actor: OrgServiceActor
  ) => {
    assertGatewayActor(actor);

    if (ciphertextBytes <= 0 || ciphertextBytes > PAM_RECORDING_MAX_CHUNK_BYTES) {
      throw new BadRequestError({
        message: `Chunk size out of range [bytes=${ciphertextBytes}, max=${PAM_RECORDING_MAX_CHUNK_BYTES}]`
      });
    }

    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session ${sessionId} not found` });

    if (actor.type === ActorType.GATEWAY && session.gatewayId && session.gatewayId !== actor.id) {
      throw new ForbiddenRequestError({ message: "Gateway not authorized for this session" });
    }
    if (actor.type === ActorType.IDENTITY && session.gatewayIdentityId && session.gatewayIdentityId !== actor.id) {
      throw new ForbiddenRequestError({ message: "Identity not authorized for this session" });
    }

    verifyGatewayUploadToken(uploadToken, session.gatewayUploadTokenHash ?? null);

    const config = session.accountId ? await resolveRecordingConfig(session.accountId) : null;
    if (!config || config.backend === PamRecordingStorageBackend.Postgres) {
      throw new BadRequestError({
        message:
          "Account is not configured for object-storage recordings. Gateway should POST ciphertext to /chunks instead."
      });
    }

    const provider = PAM_RECORDING_STORAGE_FACTORY_MAP[config.backend]();
    const presigned = await provider.mintPresignedPut({
      config,
      projectId: session.projectId,
      sessionId,
      chunkIndex,
      ciphertextBytes,
      isKeyframe
    });

    return presigned;
  };

  const recordChunk = async (
    {
      sessionId,
      chunkIndex,
      startElapsedMs,
      endElapsedMs,
      ciphertextSha256Base64,
      ciphertextBytes,
      ivBase64,
      keyframeObjectKey,
      keyframeSizeBytes,

      // For Postgres backend, the gateway POSTs the ciphertext bytes inline
      ciphertext,
      uploadToken
    }: {
      sessionId: string;
      chunkIndex: number;
      startElapsedMs: number;
      endElapsedMs: number;
      ciphertextSha256Base64: string;
      ciphertextBytes: number;
      ivBase64: string;
      keyframeObjectKey?: string;
      keyframeSizeBytes?: number;
      ciphertext?: Buffer;
      uploadToken: string;
    },
    actor: OrgServiceActor
  ) => {
    assertGatewayActor(actor);

    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session ${sessionId} not found` });

    if (actor.type === ActorType.GATEWAY && session.gatewayId && session.gatewayId !== actor.id) {
      throw new ForbiddenRequestError({ message: "Gateway not authorized for this session" });
    }
    if (actor.type === ActorType.IDENTITY && session.gatewayIdentityId && session.gatewayIdentityId !== actor.id) {
      throw new ForbiddenRequestError({ message: "Identity not authorized for this session" });
    }

    verifyGatewayUploadToken(uploadToken, session.gatewayUploadTokenHash ?? null);

    if (ciphertextBytes <= 0 || ciphertextBytes > PAM_RECORDING_MAX_CHUNK_BYTES) {
      throw new BadRequestError({
        message: `Chunk size out of range [bytes=${ciphertextBytes}, max=${PAM_RECORDING_MAX_CHUNK_BYTES}]`
      });
    }

    const BASE64_RE = new RE2(/^[A-Za-z0-9+/]*={0,2}$/);
    if (!BASE64_RE.test(ciphertextSha256Base64) || !BASE64_RE.test(ivBase64)) {
      throw new BadRequestError({ message: "Invalid base64 in chunk metadata" });
    }
    const ciphertextSha256 = Buffer.from(ciphertextSha256Base64, "base64");
    const iv = Buffer.from(ivBase64, "base64");
    if (ciphertextSha256.length !== 32) {
      throw new BadRequestError({ message: "ciphertextSha256 must be 32 bytes (sha256 digest)" });
    }
    if (iv.length !== 12) {
      throw new BadRequestError({ message: "iv must be 12 bytes (AES-GCM standard)" });
    }

    const config = session.accountId ? await resolveRecordingConfig(session.accountId) : null;
    const backend = config?.backend ?? PamRecordingStorageBackend.Postgres;

    if (backend === PamRecordingStorageBackend.Postgres) {
      if (!ciphertext) {
        throw new BadRequestError({
          message: "Postgres backend requires the ciphertext bytes to be POSTed inline"
        });
      }
      if (ciphertext.length !== ciphertextBytes) {
        throw new BadRequestError({
          message: `Declared ciphertextBytes does not match body length [declared=${ciphertextBytes}, actual=${ciphertext.length}]`
        });
      }
    }

    const externalChunkObjectKey =
      backend === PamRecordingStorageBackend.AwsS3
        ? buildExternalChunkObjectKey(config?.keyPrefix, session.projectId, sessionId, chunkIndex, false)
        : null;

    const externalKeyframeObjectKey =
      backend === PamRecordingStorageBackend.AwsS3 && keyframeObjectKey
        ? buildExternalChunkObjectKey(config?.keyPrefix, session.projectId, sessionId, chunkIndex, true)
        : null;

    try {
      await pamSessionEventChunkDAL.insertIgnoreDuplicate({
        sessionId,
        chunkIndex,
        startElapsedMs,
        endElapsedMs,
        storageBackend: backend,
        encryptedEventsBlob: backend === PamRecordingStorageBackend.Postgres ? (ciphertext ?? null) : null,
        externalChunkObjectKey,
        chunkSizeBytes: backend === PamRecordingStorageBackend.AwsS3 ? ciphertextBytes : null,
        externalKeyframeObjectKey,
        keyframeSizeBytes: keyframeSizeBytes ?? null,
        ciphertextSha256,
        ciphertextBytes,
        iv
      });
    } catch (err) {
      logger.error(
        { sessionId, chunkIndex, err },
        `Chunk insert failed [sessionId=${sessionId}] [chunkIndex=${chunkIndex}]`
      );
      throw err;
    }

    return { ok: true as const, projectId: session.projectId, accountId: session.accountId, storageBackend: backend };
  };

  const getSessionPlayback = async (sessionId: string, actor: OrgServiceActor) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session ${sessionId} not found` });

    await checkSessionViewAccess(session, actor);

    const sessionComplete = session.status !== PamSessionStatus.Active && session.status !== PamSessionStatus.Starting;

    if (!session.encryptedSessionKey) {
      throw new NotFoundError({ message: `No recording available for session ${sessionId}` });
    }

    const sessionKey = await decryptSessionKey({
      projectId: session.projectId,
      sessionId,
      encryptedSessionKey: session.encryptedSessionKey,
      kmsService
    });

    const chunks = await pamSessionEventChunkDAL.findAllBySessionId(sessionId);

    let presignedGetByObjectKey: Record<string, { url: string }> = {};
    const config = session.accountId ? await resolveRecordingConfig(session.accountId) : null;
    if (config?.backend === PamRecordingStorageBackend.AwsS3) {
      const provider = PAM_RECORDING_STORAGE_FACTORY_MAP[config.backend]();
      const minted = await Promise.all(
        chunks
          .filter((c) => c.storageBackend === PamRecordingStorageBackend.AwsS3 && c.externalChunkObjectKey)
          .map(async (c) => {
            const presigned = await provider.mintPresignedGet({
              config,
              objectKey: c.externalChunkObjectKey as string
            });
            return [c.externalChunkObjectKey as string, { url: presigned.url }] as const;
          })
      );
      presignedGetByObjectKey = Object.fromEntries(minted);
    }

    return {
      sessionKey: sessionKey.toString("base64"),
      sessionComplete,
      projectId: session.projectId,
      storageBackend: config?.backend ?? PamRecordingStorageBackend.Postgres,
      chunks: chunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        startElapsedMs: Number(c.startElapsedMs),
        endElapsedMs: Number(c.endElapsedMs),
        storageBackend: c.storageBackend as PamRecordingStorageBackend,
        externalChunkObjectKey: c.externalChunkObjectKey ?? null,
        ciphertextSha256: c.ciphertextSha256.toString("base64"),
        ciphertextBytes: Number(c.ciphertextBytes),
        iv: c.iv.toString("base64"),
        presignedGetUrl: c.externalChunkObjectKey
          ? (presignedGetByObjectKey[c.externalChunkObjectKey]?.url ?? null)
          : null
      }))
    };
  };

  const getChunkCiphertext = async (sessionId: string, chunkIndex: number, actor: OrgServiceActor) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session ${sessionId} not found` });

    await checkSessionViewAccess(session, actor);

    const chunk = await pamSessionEventChunkDAL.findByChunkIndex(sessionId, chunkIndex);
    if (!chunk) throw new NotFoundError({ message: `Chunk ${chunkIndex} not found` });
    if (chunk.storageBackend !== PamRecordingStorageBackend.Postgres) {
      throw new BadRequestError({
        message: "Chunk is stored externally; use the presigned GET URL from the playback endpoint"
      });
    }
    if (!chunk.encryptedEventsBlob) {
      throw new BadRequestError({ message: "Chunk has no inline ciphertext" });
    }
    return { ciphertext: chunk.encryptedEventsBlob };
  };

  return { requestPresignedPut, recordChunk, getSessionPlayback, getChunkCiphertext };
};
