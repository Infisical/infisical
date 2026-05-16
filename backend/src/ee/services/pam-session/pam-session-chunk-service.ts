import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TPamProjectRecordingConfigServiceFactory } from "../pam-project-recording-config/pam-project-recording-config-service";
import { PAM_RECORDING_MAX_CHUNK_BYTES } from "../pam-session-recording-storage/pam-session-recording-storage-constants";
import { PamRecordingStorageBackend } from "../pam-session-recording-storage/pam-session-recording-storage-enums";
import { PAM_RECORDING_STORAGE_FACTORY_MAP } from "../pam-session-recording-storage/pam-session-recording-storage-factory";
import { buildExternalChunkObjectKey } from "../pam-session-recording-storage/pam-session-recording-storage-types";
import { ProjectPermissionPamSessionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { TPamSessionEventChunkDALFactory } from "./pam-session-event-chunk-dal";
import { decryptSessionKey, verifyGatewayUploadToken } from "./pam-session-recording-secrets";

type TPamSessionChunkServiceFactoryDep = {
  pamSessionDAL: TPamSessionDALFactory;
  pamSessionEventChunkDAL: TPamSessionEventChunkDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  pamProjectRecordingConfigService: Pick<TPamProjectRecordingConfigServiceFactory, "resolveConfigForProject">;
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
  permissionService,
  kmsService,
  pamProjectRecordingConfigService
}: TPamSessionChunkServiceFactoryDep) => {
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

    const config = await pamProjectRecordingConfigService.resolveConfigForProject(session.projectId);
    if (!config || config.backend === PamRecordingStorageBackend.Postgres) {
      throw new BadRequestError({
        message:
          "Project is not configured for object-storage recordings. Gateway should POST ciphertext to /chunks instead."
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

      // For Postgres backend, the gateway POSTs the ciphertext bytes inline
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

    const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
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

    const config = await pamProjectRecordingConfigService.resolveConfigForProject(session.projectId);
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

    return { ok: true as const, projectId: session.projectId, storageBackend: backend };
  };

  const getPlaybackBundle = async (sessionId: string, actor: OrgServiceActor) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session ${sessionId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: session.projectId,
      actionProjectType: ActionProjectType.PAM
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamSessionActions.Read,
      ProjectPermissionSub.PamSessions
    );

    if (!session.encryptedSessionKey) {
      // Legacy session fall through to legacy decrypt path
      return { sessionKey: null, chunks: [], legacy: true as const };
    }

    const sessionKey = await decryptSessionKey({
      projectId: session.projectId,
      sessionId,
      encryptedSessionKey: session.encryptedSessionKey,
      kmsService
    });

    const chunks = await pamSessionEventChunkDAL.findAllBySessionId(sessionId);

    let presignedGetByObjectKey: Record<string, { url: string }> = {};
    const config = await pamProjectRecordingConfigService.resolveConfigForProject(session.projectId);
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
      legacy: false as const,
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

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: session.projectId,
      actionProjectType: ActionProjectType.PAM
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamSessionActions.Read,
      ProjectPermissionSub.PamSessions
    );

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

  return { requestPresignedPut, recordChunk, getPlaybackBundle, getChunkCiphertext };
};
