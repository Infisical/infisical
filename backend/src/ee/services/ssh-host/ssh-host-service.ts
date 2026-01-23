import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSshHostActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { TSshCertificateBodyDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-body-dal";
import { TSshCertificateDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-dal";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { TSshHostDALFactory } from "@app/ee/services/ssh-host/ssh-host-dal";
import { TSshHostLoginUserMappingDALFactory } from "@app/ee/services/ssh-host/ssh-host-login-user-mapping-dal";
import { TSshHostLoginUserDALFactory } from "@app/ee/services/ssh-host/ssh-login-user-dal";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { bootstrapSshProject } from "@app/services/project/project-fns";
import { TProjectSshConfigDALFactory } from "@app/services/project/project-ssh-config-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";
import {
  convertActorToPrincipals,
  createSshCert,
  createSshKeyPair,
  getSshPublicKey
} from "../ssh/ssh-certificate-authority-fns";
import { SshCertType } from "../ssh/ssh-certificate-authority-types";
import { createSshLoginMappings } from "./ssh-host-fns";
import {
  TCreateSshHostDTO,
  TDeleteSshHostDTO,
  TGetSshHostDTO,
  TIssueSshHostHostCertDTO,
  TIssueSshHostUserCertDTO,
  TListSshHostsDTO,
  TUpdateSshHostDTO
} from "./ssh-host-types";

type TSshHostServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
  groupDAL: Pick<TGroupDALFactory, "findGroupsByProjectId">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  projectSshConfigDAL: Pick<TProjectSshConfigDALFactory, "findOne" | "transaction" | "create">;
  sshCertificateAuthorityDAL: Pick<TSshCertificateAuthorityDALFactory, "findOne" | "transaction" | "create">;
  sshCertificateAuthoritySecretDAL: Pick<TSshCertificateAuthoritySecretDALFactory, "findOne" | "create">;
  sshCertificateDAL: Pick<TSshCertificateDALFactory, "create" | "transaction">;
  sshCertificateBodyDAL: Pick<TSshCertificateBodyDALFactory, "create">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findGroupMembershipsByUserIdInOrg">;
  sshHostDAL: Pick<
    TSshHostDALFactory,
    | "transaction"
    | "create"
    | "findById"
    | "updateById"
    | "deleteById"
    | "findOne"
    | "findSshHostByIdWithLoginMappings"
    | "findUserAccessibleSshHosts"
  >;
  sshHostLoginUserDAL: TSshHostLoginUserDALFactory;
  sshHostLoginUserMappingDAL: TSshHostLoginUserMappingDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "checkGroupProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSshHostServiceFactory = ReturnType<typeof sshHostServiceFactory>;

export const sshHostServiceFactory = ({
  userDAL,
  userGroupMembershipDAL,
  groupDAL,
  projectDAL,
  projectSshConfigDAL,
  sshCertificateAuthorityDAL,
  sshCertificateAuthoritySecretDAL,
  sshCertificateDAL,
  sshCertificateBodyDAL,
  sshHostDAL,
  sshHostLoginUserMappingDAL,
  sshHostLoginUserDAL,
  permissionService,
  kmsService
}: TSshHostServiceFactoryDep) => {
  /**
   * Return list of all SSH hosts that a user can issue user SSH certificates for
   * (i.e. is able to access / connect to) across all SSH projects in the organization
   */
  const listSshHosts = async ({ actorId, actorAuthMethod, actor, actorOrgId }: TListSshHostsDTO) => {
    if (actor !== ActorType.USER) {
      // (dangtony98): only support user for now
      throw new BadRequestError({ message: `Actor type ${actor} not supported` });
    }

    const sshProjects = await projectDAL.find({
      orgId: actorOrgId
    });

    const allowedHosts = [];

    for await (const project of sshProjects) {
      try {
        await permissionService.getProjectPermission({
          actor,
          actorId,
          projectId: project.id,
          actorAuthMethod,
          actorOrgId,
          actionProjectType: ActionProjectType.SSH
        });

        const projectHosts = await sshHostDAL.findUserAccessibleSshHosts([project.id], actorId);

        allowedHosts.push(...projectHosts);
      } catch {
        // intentionally ignore projects where user lacks access
      }
    }

    return allowedHosts;
  };

  const createSshHost = async ({
    projectId,
    hostname,
    alias,
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSshHostActions.Create,
      subject(ProjectPermissionSub.SshHosts, {
        hostname
      })
    );

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

      const ca = await sshCertificateAuthorityDAL.findOne({
        id: finalId,
        projectId
      });

      if (!ca) {
        throw new BadRequestError({
          message: `${label} SSH CA with ID '${finalId}' not found in project '${projectId}'`
        });
      }

      return ca.id;
    };

    let projectSshConfig = await projectSshConfigDAL.findOne({ projectId });
    if (!projectSshConfig) {
      projectSshConfig = await projectSshConfigDAL.transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SshInit(projectId)]);

        let sshConfig = await projectSshConfigDAL.findOne({ projectId }, tx);
        if (sshConfig) return sshConfig;

        sshConfig = await bootstrapSshProject({
          projectId,
          sshCertificateAuthorityDAL,
          sshCertificateAuthoritySecretDAL,
          kmsService,
          projectSshConfigDAL,
          tx
        });
        return sshConfig;
      });
    }

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
      const host = await sshHostDAL.create(
        {
          projectId,
          hostname,
          alias: alias === "" ? null : alias,
          userCertTtl,
          hostCertTtl,
          userSshCaId,
          hostSshCaId
        },
        tx
      );

      await createSshLoginMappings({
        sshHostId: host.id,
        loginMappings,
        sshHostLoginUserDAL,
        sshHostLoginUserMappingDAL,
        groupDAL,
        userDAL,
        permissionService,
        projectId,
        actorAuthMethod,
        actorOrgId,
        tx
      });

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
    alias,
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSshHostActions.Edit,
      subject(ProjectPermissionSub.SshHosts, {
        hostname: host.hostname
      })
    );

    const updatedHost = await sshHostDAL.transaction(async (tx) => {
      await sshHostDAL.updateById(
        sshHostId,
        {
          hostname,
          alias: alias === "" ? null : alias,
          userCertTtl,
          hostCertTtl
        },
        tx
      );

      if (loginMappings) {
        await sshHostLoginUserDAL.delete({ sshHostId: host.id }, tx);
        if (loginMappings.length) {
          await createSshLoginMappings({
            sshHostId: host.id,
            loginMappings,
            sshHostLoginUserDAL,
            sshHostLoginUserMappingDAL,
            groupDAL,
            userDAL,
            permissionService,
            projectId: host.projectId,
            actorAuthMethod,
            actorOrgId,
            tx
          });
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSshHostActions.Delete,
      subject(ProjectPermissionSub.SshHosts, {
        hostname: host.hostname
      })
    );

    await sshHostDAL.deleteById(sshHostId);

    return host;
  };

  const getSshHostById = async ({ sshHostId, actorId, actorAuthMethod, actor, actorOrgId }: TGetSshHostDTO) => {
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSshHostActions.Read,
      subject(ProjectPermissionSub.SshHosts, {
        hostname: host.hostname
      })
    );

    return host;
  };

  /**
   * Return SSH certificate and corresponding new SSH public-private key pair where
   * SSH public key is signed using CA behind SSH certificate with name [templateName].
   *
   * Note: Used for issuing SSH credentials as part of request against a specific SSH Host.
   */
  const issueSshHostUserCert = async ({
    sshHostId,
    loginUser,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TIssueSshHostUserCertDTO) => {
    const host = await sshHostDAL.findSshHostByIdWithLoginMappings(sshHostId);
    if (!host) {
      throw new NotFoundError({
        message: `SSH host with ID ${sshHostId} not found`
      });
    }

    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: host.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    const internalPrincipals = await convertActorToPrincipals({
      actor,
      actorId,
      userDAL
    });

    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actorId, actorOrgId);
    const userGroupSlugs = userGroups.map((g) => g.groupSlug);

    const mapping = host.loginMappings.find(
      (m) =>
        m.loginUser === loginUser &&
        (m.allowedPrincipals.usernames?.some((allowed) => internalPrincipals.includes(allowed)) ||
          m.allowedPrincipals.groups?.some((allowed) => userGroupSlugs.includes(allowed)))
    );

    if (!mapping) {
      throw new UnauthorizedError({
        message: `You are not allowed to login as ${loginUser} on this host`
      });
    }

    const keyId = `${actor}-${actorId}`;

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: host.userSshCaId });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: host.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    // (dangtony98): will support more algorithms in the future
    const keyAlgorithm = SshCertKeyAlgorithm.ED25519;
    const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);

    // (dangtony98): include the loginUser as a principal on the issued certificate
    const principals = [...internalPrincipals, loginUser];

    const { serialNumber, signedPublicKey, ttl } = await createSshCert({
      caPrivateKey: decryptedCaPrivateKey.toString("utf8"),
      clientPublicKey: publicKey,
      keyId,
      principals,
      requestedTtl: host.userCertTtl,
      certType: SshCertType.USER
    });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: host.projectId
    });

    const encryptedCertificate = secretManagerEncryptor({
      plainText: Buffer.from(signedPublicKey, "utf8")
    }).cipherTextBlob;

    await sshCertificateDAL.transaction(async (tx) => {
      const cert = await sshCertificateDAL.create(
        {
          sshCaId: host.userSshCaId,
          sshHostId: host.id,
          serialNumber,
          certType: SshCertType.USER,
          principals,
          keyId,
          notBefore: new Date(),
          notAfter: new Date(Date.now() + ttl * 1000)
        },
        tx
      );

      await sshCertificateBodyDAL.create(
        {
          sshCertId: cert.id,
          encryptedCertificate
        },
        tx
      );
    });

    return {
      host,
      principals,
      serialNumber,
      signedPublicKey,
      privateKey,
      publicKey,
      ttl,
      keyAlgorithm
    };
  };

  const issueSshHostHostCert = async ({
    sshHostId,
    publicKey,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TIssueSshHostHostCertDTO) => {
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSshHostActions.IssueHostCert,
      subject(ProjectPermissionSub.SshHosts, {
        hostname: host.hostname
      })
    );

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: host.hostSshCaId });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: host.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const principals = [host.hostname];
    const keyId = `host-${host.id}`;

    const { serialNumber, signedPublicKey, ttl } = await createSshCert({
      caPrivateKey: decryptedCaPrivateKey.toString("utf8"),
      clientPublicKey: publicKey,
      keyId,
      principals,
      requestedTtl: host.hostCertTtl,
      certType: SshCertType.HOST
    });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: host.projectId
    });

    const encryptedCertificate = secretManagerEncryptor({
      plainText: Buffer.from(signedPublicKey, "utf8")
    }).cipherTextBlob;

    await sshCertificateDAL.transaction(async (tx) => {
      const cert = await sshCertificateDAL.create(
        {
          sshCaId: host.hostSshCaId,
          sshHostId: host.id,
          serialNumber,
          certType: SshCertType.HOST,
          principals,
          keyId,
          notBefore: new Date(),
          notAfter: new Date(Date.now() + ttl * 1000)
        },
        tx
      );

      await sshCertificateBodyDAL.create(
        {
          sshCertId: cert.id,
          encryptedCertificate
        },
        tx
      );
    });

    return { host, principals, serialNumber, signedPublicKey };
  };

  const getSshHostUserCaPk = async (sshHostId: string) => {
    const host = await sshHostDAL.findById(sshHostId);
    if (!host) {
      throw new NotFoundError({
        message: `SSH host with ID ${sshHostId} not found`
      });
    }

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: host.userSshCaId });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: host.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const publicKey = await getSshPublicKey(decryptedCaPrivateKey.toString("utf-8"));

    return publicKey;
  };

  const getSshHostHostCaPk = async (sshHostId: string) => {
    const host = await sshHostDAL.findById(sshHostId);
    if (!host) {
      throw new NotFoundError({
        message: `SSH host with ID ${sshHostId} not found`
      });
    }

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: host.hostSshCaId });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: host.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const publicKey = await getSshPublicKey(decryptedCaPrivateKey.toString("utf-8"));

    return publicKey;
  };

  return {
    listSshHosts,
    createSshHost,
    updateSshHost,
    deleteSshHost,
    getSshHostById,
    issueSshHostUserCert,
    issueSshHostHostCert,
    getSshHostUserCaPk,
    getSshHostHostCaPk
  };
};
