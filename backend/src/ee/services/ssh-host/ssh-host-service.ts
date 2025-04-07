import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { TSshHostDALFactory } from "@app/ee/services/ssh-host/ssh-host-dal";
import { TSshHostLoginMappingDALFactory } from "@app/ee/services/ssh-host/ssh-host-login-mapping-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectSshConfigDALFactory } from "@app/services/project/project-ssh-config-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { convertActorToPrincipals, createSshCert, createSshKeyPair } from "../ssh/ssh-certificate-authority-fns";
import { SshCertType } from "../ssh/ssh-certificate-authority-types";
import {
  TCreateSshHostDTO,
  TDeleteSshHostDTO,
  TGetSshHostDTO,
  TIssueSshCredsFromHostDTO,
  TListSshHostsDTO,
  TUpdateSshHostDTO
} from "./ssh-host-types";

type TSshCertificateAuthorityServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  projectSshConfigDAL: Pick<TProjectSshConfigDALFactory, "findOne">;
  sshCertificateAuthorityDAL: Pick<TSshCertificateAuthorityDALFactory, "findById">;
  sshCertificateAuthoritySecretDAL: Pick<TSshCertificateAuthoritySecretDALFactory, "findOne">;
  sshHostDAL: Pick<
    TSshHostDALFactory,
    | "transaction"
    | "create"
    | "findById"
    | "updateById"
    | "deleteById"
    | "findOne"
    | "findSshHostByIdWithLoginMappings"
    | "findSshHostsWithPrincipalsAcrossProjects"
  >;
  sshHostLoginMappingDAL: Pick<
    TSshHostLoginMappingDALFactory,
    "transaction" | "create" | "findById" | "updateById" | "deleteById" | "findOne" | "insertMany" | "delete"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSshHostServiceFactory = ReturnType<typeof sshHostServiceFactory>;

/**
 * Checklist:
 * - check permissions across various roles to make sure it makes sense for the SSH hosts
 */

export const sshHostServiceFactory = ({
  userDAL,
  projectDAL,
  projectSshConfigDAL,
  sshCertificateAuthorityDAL,
  sshCertificateAuthoritySecretDAL,
  sshHostDAL,
  sshHostLoginMappingDAL,
  permissionService,
  kmsService
}: TSshCertificateAuthorityServiceFactoryDep) => {
  /**
   * Return list of all SSH hosts that a user has access to across all SSH projects in the organization
   */
  const listSshHosts = async ({ actorId, actorAuthMethod, actor, actorOrgId }: TListSshHostsDTO) => {
    const sshProjects = await projectDAL.find({
      orgId: actorOrgId,
      type: ProjectType.SSH
    });

    const projectIdsWithAccess: string[] = [];

    for await (const project of sshProjects) {
      let hasAccess = false;

      try {
        const { permission } = await permissionService.getProjectPermission({
          actor,
          actorId,
          projectId: project.id,
          actorAuthMethod,
          actorOrgId,
          actionProjectType: ActionProjectType.SSH
        });

        // TODO: consider glob-based permission items
        hasAccess = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SshHosts);
      } catch {
        hasAccess = false;
      }

      if (hasAccess) {
        projectIdsWithAccess.push(project.id);
      }
    }

    // const principals = await convertActorToPrincipals({
    //   actor,
    //   actorId,
    //   userDAL
    // });

    const hosts = await sshHostDAL.findSshHostsWithPrincipalsAcrossProjects(projectIdsWithAccess, [
      "dangtony98+2@gmail.com" // hardcode for now
    ]);

    return hosts;
  };

  const createSshHost = async ({
    projectId,
    hostname,
    userCertTtl,
    hostCertTtl,
    loginMappings,
    userSshCaId: requestedUserSshCaId,
    hostSshCaId: requestedHostSshCaId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateSshHostDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.SshHosts);

    const resolveSshCaId = async ({
      requestedId,
      fallbackId,
      label
    }: {
      requestedId?: string;
      fallbackId?: string | null;
      label: "User" | "Host";
    }) => {
      const finalId = requestedId ?? fallbackId;
      if (!finalId) {
        throw new BadRequestError({ message: `Missing ${label.toLowerCase()} SSH CA` });
      }

      const ca = await sshCertificateAuthorityDAL.findById(finalId);
      if (!ca) {
        throw new BadRequestError({ message: `${label} SSH CA with ID '${finalId}' not found` });
      }

      return ca.id;
    };

    const projectSshConfig = await projectSshConfigDAL.findOne({ projectId });

    const userSshCaId = await resolveSshCaId({
      requestedId: requestedUserSshCaId,
      fallbackId: projectSshConfig?.defaultUserSshCaId,
      label: "User"
    });

    const hostSshCaId = await resolveSshCaId({
      requestedId: requestedHostSshCaId,
      fallbackId: projectSshConfig?.defaultHostSshCaId,
      label: "Host"
    });

    const newSshHost = await sshHostDAL.transaction(async (tx) => {
      const existingHost = await sshHostDAL.findOne(
        {
          projectId,
          hostname
        },
        tx
      );

      if (existingHost) {
        throw new BadRequestError({
          message: `SSH host with hostname ${hostname} already exists`
        });
      }

      const host = await sshHostDAL.create(
        {
          projectId,
          hostname,
          userCertTtl,
          hostCertTtl,
          userSshCaId,
          hostSshCaId
        },
        tx
      );

      await sshHostLoginMappingDAL.insertMany(
        loginMappings.map(({ loginUser, allowedPrincipals }) => ({
          sshHostId: host.id,
          loginUser,
          allowedPrincipals
        })),
        tx
      );

      const newSshHostWithLoginMappings = await sshHostDAL.findSshHostByIdWithLoginMappings(host.id, tx);
      if (!newSshHostWithLoginMappings) {
        throw new NotFoundError({ message: `SSH host with ID '${host.id}' not found` });
      }

      return newSshHostWithLoginMappings;
    });

    return newSshHost;
  };

  const updateSshHost = async ({
    sshHostId,
    hostname,
    userCertTtl,
    hostCertTtl,
    loginMappings,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateSshHostDTO) => {
    const host = await sshHostDAL.findById(sshHostId);
    if (!host) throw new NotFoundError({ message: `SSH host with ID '${sshHostId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: host.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SshHosts);

    const updatedHost = await sshHostDAL.transaction(async (tx) => {
      await sshHostDAL.updateById(
        sshHostId,
        {
          hostname,
          userCertTtl,
          hostCertTtl
        },
        tx
      );

      if (loginMappings) {
        await sshHostLoginMappingDAL.delete({ sshHostId }, tx);
        if (loginMappings.length) {
          await sshHostLoginMappingDAL.insertMany(
            loginMappings.map(({ loginUser, allowedPrincipals }) => ({
              sshHostId: host.id,
              loginUser,
              allowedPrincipals
            })),
            tx
          );
        }
      }

      const updatedHostWithLoginMappings = await sshHostDAL.findSshHostByIdWithLoginMappings(sshHostId, tx);
      if (!updatedHostWithLoginMappings) {
        throw new NotFoundError({ message: `SSH host with ID '${sshHostId}' not found` });
      }

      return updatedHostWithLoginMappings;
    });

    return updatedHost;
  };

  const deleteSshHost = async ({ sshHostId, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteSshHostDTO) => {
    const host = await sshHostDAL.findSshHostByIdWithLoginMappings(sshHostId);
    if (!host) throw new NotFoundError({ message: `SSH host with ID '${sshHostId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: host.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.SshHosts);

    await sshHostDAL.transaction(async (tx) => {
      await sshHostLoginMappingDAL.delete({ sshHostId }, tx);
      await sshHostDAL.deleteById(sshHostId, tx);
    });

    return host;
  };

  const getSshHost = async ({ sshHostId, actorId, actorAuthMethod, actor, actorOrgId }: TGetSshHostDTO) => {
    const host = await sshHostDAL.findSshHostByIdWithLoginMappings(sshHostId);
    if (!host) {
      throw new NotFoundError({
        message: `SSH host with ID ${sshHostId} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: host.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SshHosts);

    return host;
  };

  /**
   * Return SSH certificate and corresponding new SSH public-private key pair where
   * SSH public key is signed using CA behind SSH certificate with name [templateName].
   *
   * Note: Used for issuing SSH credentials as part of request against a specific SSH Host.
   */
  const issueSshCredsFromHost = async ({
    sshHostId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TIssueSshCredsFromHostDTO) => {
    const host = await sshHostDAL.findSshHostByIdWithLoginMappings(sshHostId);
    if (!host) {
      throw new NotFoundError({
        message: `SSH host with ID ${sshHostId} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: host.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SshHosts);

    // TODO: update permissions

    const keyId = `${actor}-${actorId}`;

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: host.userSshCaId });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: host.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    // create user key pair
    const keyAlgorithm = SshCertKeyAlgorithm.ED25519; // (dangtony98): will support more algorithms in the future
    const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);

    const principals = await convertActorToPrincipals({
      actor,
      actorId,
      userDAL
    });

    const { serialNumber, signedPublicKey, ttl } = await createSshCert({
      caPrivateKey: decryptedCaPrivateKey.toString("utf8"),
      clientPublicKey: publicKey,
      keyId,
      principals,
      requestedTtl: host.userCertTtl,
      certType: SshCertType.USER
    });

    return {
      serialNumber,
      signedPublicKey,
      privateKey,
      publicKey,
      ttl,
      keyId,
      keyAlgorithm
    };
  };

  return {
    listSshHosts,
    createSshHost,
    updateSshHost,
    deleteSshHost,
    getSshHost,
    issueSshCredsFromHost
  };
};
