import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { createSshCert, createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertType } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { PamSessionStatus } from "../pam/pam-enums";
import {
  checkAccountAccess,
  getViewSessionsResourceIds,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { generateSessionRecordingSecrets } from "../pam-session-recording/pam-recording-secrets";
import { ResourcePermissionPamResourceActions } from "../permission/resource-permission";
import { TPamSessionDALFactory } from "./pam-session-dal";

type TPamSessionServiceFactoryDep = {
  pamSessionDAL: Pick<
    TPamSessionDALFactory,
    "findAccessibleByProjectId" | "findById" | "findOne" | "endSessionById" | "updateById"
  >;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TPamSessionServiceFactory = ReturnType<typeof pamSessionServiceFactory>;

export const pamSessionServiceFactory = ({
  pamSessionDAL,
  pamAccountDAL,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  kmsService
}: TPamSessionServiceFactoryDep) => {
  const decrypt = async (projectId: string, blob: Buffer): Promise<Record<string, unknown>> => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    return JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<string, unknown>;
  };

  const checkAccount = (
    accountId: string,
    folderId: string | null | undefined,
    projectId: string,
    action: ResourcePermissionPamResourceActions,
    ctx: TActorContext
  ) => checkAccountAccess(permissionService, accountId, folderId, projectId, action, ctx);

  const listSessions = async (
    projectId: string,
    ctx: TActorContext,
    pagination?: { offset?: number; limit?: number }
  ) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const { folderIds, accountIds } = await getViewSessionsResourceIds(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      ctx
    );

    return pamSessionDAL.findAccessibleByProjectId(projectId, {
      viewSessionsFolderIds: folderIds,
      viewSessionsAccountIds: accountIds,
      userId: ctx.actorId,
      ...pagination
    });
  };

  const getSessionById = async (sessionId: string, ctx: TActorContext) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session || !session.accountId) return null;

    const isOwnSession = session.userId === ctx.actorId;
    if (!isOwnSession) {
      const account = await pamAccountDAL.findByIdWithDetails(session.accountId);
      await checkAccount(
        session.accountId,
        account?.folderId,
        session.projectId,
        ResourcePermissionPamResourceActions.ViewSessions,
        ctx
      );
    }

    return session;
  };

  // Called by the gateway
  const getSessionCredentials = async (sessionId: string, gatewayId: string) => {
    const session = await pamSessionDAL.findOne({ id: sessionId, gatewayId });
    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }

    if (session.status !== PamSessionStatus.Starting && session.status !== PamSessionStatus.Active) {
      throw new BadRequestError({ message: "Session is not active" });
    }

    if (!session.accountId) {
      throw new BadRequestError({ message: "Session has no linked account" });
    }

    const account = await pamAccountDAL.findByIdWithDetails(session.accountId);
    if (!account) {
      throw new NotFoundError({ message: "Account not found" });
    }

    const connectionDetails = await decrypt(session.projectId, account.encryptedConnectionDetails);
    const credentials = await decrypt(session.projectId, account.encryptedCredentials);

    if (credentials.authMethod === "certificate" && account.encryptedCaPrivateKey) {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: session.projectId
      });
      const caPrivateKey = decryptor({
        cipherTextBlob: account.encryptedCaPrivateKey
      }).toString("utf-8");

      const keyAlgorithm = (account.caKeyAlgorithm as SshCertKeyAlgorithm) || SshCertKeyAlgorithm.ED25519;
      const { publicKey: clientPublicKey, privateKey: clientPrivateKey } = await createSshKeyPair(keyAlgorithm);

      const username = credentials.username as string;
      const { signedPublicKey } = await createSshCert({
        caPrivateKey,
        clientPublicKey,
        keyId: `pam-session-${session.id}`,
        principals: [username],
        requestedTtl: "8h",
        certType: SshCertType.USER
      });

      credentials.privateKey = clientPrivateKey;
      credentials.certificate = signedPublicKey;
    }

    const sessionStarted = session.status === PamSessionStatus.Starting;

    let recording: {
      sessionKey: string;
      uploadToken: string;
      storageBackend: PamRecordingStorageBackend;
      projectId: string;
      sessionId: string;
    } | null = null;

    if (!session.encryptedSessionKey) {
      const secrets = await generateSessionRecordingSecrets({
        projectId: session.projectId,
        sessionId,
        kmsService
      });

      await pamSessionDAL.updateById(sessionId, {
        encryptedSessionKey: secrets.encryptedSessionKey,
        gatewayUploadTokenHash: secrets.uploadTokenHash
      });

      recording = {
        sessionKey: secrets.sessionKey.toString("base64"),
        uploadToken: secrets.uploadToken.toString("base64"),
        storageBackend: PamRecordingStorageBackend.Postgres,
        projectId: session.projectId,
        sessionId
      };
    }

    return {
      credentials: { ...connectionDetails, ...credentials },
      recording,
      projectId: session.projectId,
      accountName: session.accountName,
      sessionStarted
    };
  };

  // Called by the gateway
  const endSessionFromGateway = async (sessionId: string, gatewayId: string) => {
    const session = await pamSessionDAL.findOne({ id: sessionId, gatewayId });
    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }

    const updatedSession = await pamSessionDAL.endSessionById(sessionId);

    return {
      projectId: session.projectId,
      accountName: session.accountName,
      alreadyEnded: !updatedSession
    };
  };

  return {
    listSessions,
    getSessionById,
    getSessionCredentials,
    endSessionFromGateway
  };
};
