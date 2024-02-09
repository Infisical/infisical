/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { ProjectMembershipRole, ProjectVersion, SecretKeyEncoding, TSecrets } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import { createSecretBlindIndex } from "@app/lib/crypto";
import {
  decryptAsymmetric,
  encryptSymmetric128BitHexKeyUTF8,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { createProjectKey, createWsMembers } from "@app/lib/project";
import { decryptSecrets, SecretDocType, TPartialSecret } from "@app/lib/secret";

import { ActorType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityProjectDALFactory } from "../identity-project/identity-project-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretVersionDALFactory } from "../secret/secret-version-dal";
import { TSecretBlindIndexDALFactory } from "../secret-blind-index/secret-blind-index-dal";
import { ROOT_FOLDER_NAME, TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectDALFactory } from "./project-dal";
import { TCreateProjectDTO, TDeleteProjectDTO, TGetProjectDTO, TUpgradeProjectDTO } from "./project-types";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

type TProjectServiceFactoryDep = {
  projectDAL: TProjectDALFactory;
  userDAL: TUserDALFactory;
  folderDAL: TSecretFolderDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "insertMany" | "find">;
  secretVersionDAL: TSecretVersionDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  identityProjectDAL: TIdentityProjectDALFactory;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "create" | "findLatestProjectKey" | "delete" | "find" | "insertMany">;
  projectBotDAL: Pick<TProjectBotDALFactory, "create" | "findById" | "delete" | "findOne">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "create" | "findProjectGhostUser" | "findOne">;
  orgDAL: TOrgDALFactory;
  secretApprovalRequestDAL: TSecretApprovalRequestDALFactory;
  secretApprovalSecretDAL: TSecretApprovalRequestSecretDALFactory;
  secretBlindIndexDAL: Pick<TSecretBlindIndexDALFactory, "create">;
  permissionService: TPermissionServiceFactory;
  orgService: Pick<TOrgServiceFactory, "addGhostUser">;
  secretDAL: TSecretDALFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TProjectServiceFactory = ReturnType<typeof projectServiceFactory>;

export const projectServiceFactory = ({
  projectDAL,
  projectKeyDAL,
  secretApprovalRequestDAL,
  secretApprovalSecretDAL,
  permissionService,
  userDAL,
  folderDAL,
  orgService,
  orgDAL,
  identityProjectDAL,
  secretVersionDAL,
  projectBotDAL,
  identityOrgMembershipDAL,
  secretDAL,
  secretBlindIndexDAL,
  projectMembershipDAL,
  projectEnvDAL,
  licenseService
}: TProjectServiceFactoryDep) => {
  /*
   * Create workspace. Make user the admin
   * */
  const createProject = async ({ orgId, actor, actorId, actorOrgId, workspaceName }: TCreateProjectDTO) => {
    const { permission, membership: orgMembership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      orgId,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);

    const appCfg = getConfig();
    const blindIndex = createSecretBlindIndex(appCfg.ROOT_ENCRYPTION_KEY, appCfg.ENCRYPTION_KEY);

    const plan = await licenseService.getPlan(orgId);
    if (plan.workspaceLimit !== null && plan.workspacesUsed >= plan.workspaceLimit) {
      // case: limit imposed on number of workspaces allowed
      // case: number of workspaces used exceeds the number of workspaces allowed
      throw new BadRequestError({
        message: "Failed to create workspace due to plan limit reached. Upgrade plan to add more workspaces."
      });
    }

    const results = await projectDAL.transaction(async (tx) => {
      const ghostUser = await orgService.addGhostUser(orgId, tx);

      const project = await projectDAL.create(
        {
          name: workspaceName,
          orgId,
          slug: slugify(`${workspaceName}-${alphaNumericNanoId(4)}`),
          version: ProjectVersion.V2
        },
        tx
      );
      // set ghost user as admin of project
      await projectMembershipDAL.create(
        {
          userId: ghostUser.user.id,
          role: ProjectMembershipRole.Admin,
          projectId: project.id
        },
        tx
      );

      // generate the blind index for project
      await secretBlindIndexDAL.create(
        {
          projectId: project.id,
          keyEncoding: blindIndex.keyEncoding,
          saltIV: blindIndex.iv,
          saltTag: blindIndex.tag,
          algorithm: blindIndex.algorithm,
          encryptedSaltCipherText: blindIndex.ciphertext
        },
        tx
      );
      // set default environments and root folder for provided environments
      const envs = await projectEnvDAL.insertMany(
        DEFAULT_PROJECT_ENVS.map((el, i) => ({ ...el, projectId: project.id, position: i + 1 })),
        tx
      );
      await folderDAL.insertMany(
        envs.map(({ id }) => ({ name: ROOT_FOLDER_NAME, envId: id, version: 1 })),
        tx
      );

      // 3. Create a random key that we'll use as the project key.
      const { key: encryptedProjectKey, iv: encryptedProjectKeyIv } = createProjectKey({
        publicKey: ghostUser.keys.publicKey,
        privateKey: ghostUser.keys.plainPrivateKey
      });

      // 4. Save the project key for the ghost user.
      await projectKeyDAL.create(
        {
          projectId: project.id,
          receiverId: ghostUser.user.id,
          encryptedKey: encryptedProjectKey,
          nonce: encryptedProjectKeyIv,
          senderId: ghostUser.user.id
        },
        tx
      );

      const { iv, tag, ciphertext, encoding, algorithm } = infisicalSymmetricEncypt(ghostUser.keys.plainPrivateKey);

      // 5. Create & a bot for the project
      await projectBotDAL.create(
        {
          name: "Infisical Bot (Ghost)",
          projectId: project.id,
          tag,
          iv,
          encryptedProjectKey,
          encryptedProjectKeyNonce: encryptedProjectKeyIv,
          encryptedPrivateKey: ciphertext,
          isActive: true,
          publicKey: ghostUser.keys.publicKey,
          senderId: ghostUser.user.id,
          algorithm,
          keyEncoding: encoding
        },
        tx
      );

      // Find the ghost users latest key
      const latestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.user.id, project.id, tx);

      if (!latestKey) {
        throw new Error("Latest key not found for user");
      }

      // If the project is being created by a user, add the user to the project as an admin
      if (actor === ActorType.USER) {
        // Find public key of user
        const user = await userDAL.findUserEncKeyByUserId(actorId);

        if (!user) {
          throw new Error("User not found");
        }

        const [projectAdmin] = createWsMembers({
          decryptKey: latestKey,
          userPrivateKey: ghostUser.keys.plainPrivateKey,
          members: [
            {
              userPublicKey: user.publicKey,
              orgMembershipId: orgMembership.id,
              projectMembershipRole: ProjectMembershipRole.Admin
            }
          ]
        });

        // Create a membership for the user
        await projectMembershipDAL.create(
          {
            projectId: project.id,
            userId: user.id,
            role: projectAdmin.projectRole
          },
          tx
        );

        // Create a project key for the user
        await projectKeyDAL.create(
          {
            encryptedKey: projectAdmin.workspaceEncryptedKey,
            nonce: projectAdmin.workspaceEncryptedNonce,
            senderId: ghostUser.user.id,
            receiverId: user.id,
            projectId: project.id
          },
          tx
        );
      }

      // If the project is being created by an identity, add the identity to the project as an admin
      else if (actor === ActorType.IDENTITY) {
        // Find identity org membership
        const identityOrgMembership = await identityOrgMembershipDAL.findOne(
          {
            identityId: actorId,
            orgId: project.orgId
          },
          tx
        );

        // If identity org membership not found, throw error
        if (!identityOrgMembership) {
          throw new BadRequestError({
            message: `Failed to find identity with id ${actorId}`
          });
        }

        // Get the role permission for the identity
        // IS THIS CORRECT?
        const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
          ProjectMembershipRole.Admin,
          orgId
        );

        const hasPrivilege = isAtLeastAsPrivileged(permission, rolePermission);
        if (!hasPrivilege)
          throw new ForbiddenRequestError({
            message: "Failed to add identity to project with more privileged role"
          });
        const isCustomRole = Boolean(customRole);

        await identityProjectDAL.create(
          {
            identityId: actorId,
            projectId: project.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : ProjectMembershipRole.Admin,
            roleId: customRole?.id
          },
          tx
        );
      }

      return {
        ...project,
        environments: envs,
        _id: project.id
      };
    });

    return results;
  };

  const findProjectGhostUser = async (projectId: string) => {
    const user = await projectMembershipDAL.findProjectGhostUser(projectId);

    return user;
  };

  const deleteProject = async ({ actor, actorId, actorOrgId, projectId }: TDeleteProjectDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Project);

    const deletedProject = await projectDAL.deleteById(projectId);
    return deletedProject;
  };

  const getProjects = async (actorId: string) => {
    const workspaces = await projectDAL.findAllProjects(actorId);
    return workspaces;
  };

  const getAProject = async ({ actorId, actorOrgId, projectId, actor }: TGetProjectDTO) => {
    await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    return projectDAL.findProjectById(projectId);
  };

  const toggleAutoCapitalization = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    autoCapitalization
  }: TGetProjectDTO & { autoCapitalization: boolean }) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const updatedProject = await projectDAL.updateById(projectId, { autoCapitalization });
    return updatedProject;
  };

  const updateName = async ({ projectId, actor, actorId, actorOrgId, name }: TGetProjectDTO & { name: string }) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const updatedProject = await projectDAL.updateById(projectId, { name });
    return updatedProject;
  };

  const upgradeProject = async ({ projectId, actor, actorId, userPrivateKey }: TUpgradeProjectDTO) => {
    const { permission, membership } = await permissionService.getProjectPermission(actor, actorId, projectId);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Project);

    if (membership?.role !== ProjectMembershipRole.Admin) {
      throw new ForbiddenRequestError({
        message: "User must be admin"
      });
    }

    /*
    1. Get the existing project 
    2. Get the existing project keys
    4. Get all the project envs & folders
    5. Get ALL secrets within the project
    6. Create a new ghost user
    7. Create a project membership for the ghost user
    8. Get the existing bot, and the existing project keys for the members of the project
    9. IF a bot already exists for the project, delete it!
    10. Delete all the existing project keys
    11. Create a project key for the ghost user
    12. Find the newly created ghost user's latest key
    

    FOR EACH OF THE OLD PROJECT KEYS (loop):
    	13. Find the user based on the key.receiverId.
    	14. Find the org membership for the user.
    	15. Create a new project key for the user.
    

		16. Encrypt the ghost user's private key
		17. Create a new bot, and set the public/private key of the bot, to the ghost user's public/private key.
		18. Add the workspace key to the bot
		19. Decrypt the secrets with the old project key
		20. Get the newly created bot's private key, and workspace key (we do it this way to test as many steps of the bot process as possible)
		21. Get the workspace key from the bot


		FOR EACH DECRYPTED SECRET (loop):
			22. Re-encrypt the secret value, secret key, and secret comment with the NEW project key from the bot.
			23. Update the secret in the database with the new encrypted values.
   
		
		24. Transaction ends. If there were no errors. All changes are applied.
		25. API route returns 200 OK.
		*/

    const project = await projectDAL.findOne({ id: projectId, version: ProjectVersion.V1 });
    const oldProjectKey = await projectKeyDAL.findLatestProjectKey(actorId, projectId);
    if (!project || !oldProjectKey) {
      throw new BadRequestError({
        message: "Project or project key not found"
      });
    }

    const projectEnvs = await projectEnvDAL.find({
      projectId: project.id
    });

    console.log(
      "projectEnvs",
      projectEnvs.map((e) => e.name)
    );

    const projectFolders = await folderDAL.find({
      $in: {
        envId: projectEnvs.map((env) => env.id)
      }
    });

    // Get all the secrets within the project (as encrypted)
    const secrets: TPartialSecret[] = [];
    for (const folder of projectFolders) {
      const folderSecrets = await secretDAL.find({ folderId: folder.id });

      const folderSecretVersions = await secretVersionDAL.find({
        folderId: folder.id
      });
      const approvalRequests = await secretApprovalRequestDAL.find({
        status: RequestState.Open,
        folderId: folder.id
      });
      const approvalSecrets = await secretApprovalSecretDAL.find({
        $in: {
          requestId: approvalRequests.map((el) => el.id)
        }
      });

      secrets.push(...folderSecrets.map((el) => ({ ...el, docType: SecretDocType.Secret })));
      secrets.push(...folderSecretVersions.map((el) => ({ ...el, docType: SecretDocType.SecretVersion })));
      secrets.push(...approvalSecrets.map((el) => ({ ...el, docType: SecretDocType.ApprovalSecret })));
    }

    const decryptedSecrets = decryptSecrets(secrets, userPrivateKey, oldProjectKey);

    if (secrets.length !== decryptedSecrets.length) {
      throw new Error("Failed to decrypt some secret versions");
    }

    // Get the existing bot and the existing project keys for the members of the project
    const existingBot = await projectBotDAL.findOne({ projectId: project.id }).catch(() => null);
    const existingProjectKeys = await projectKeyDAL.find({ projectId: project.id });

    // TRANSACTION START
    await projectDAL.transaction(async (tx) => {
      await projectDAL.updateById(project.id, { version: ProjectVersion.V2 }, tx);

      // Create a ghost user
      const ghostUser = await orgService.addGhostUser(project.orgId, tx);

      // Create a project key
      const { key: newEncryptedProjectKey, iv: newEncryptedProjectKeyIv } = createProjectKey({
        publicKey: ghostUser.keys.publicKey,
        privateKey: ghostUser.keys.plainPrivateKey
      });

      console.log("Creating new project key for ghost user");
      // Create a new project key for the GHOST
      await projectKeyDAL.create(
        {
          projectId: project.id,
          receiverId: ghostUser.user.id,
          encryptedKey: newEncryptedProjectKey,
          nonce: newEncryptedProjectKeyIv,
          senderId: ghostUser.user.id
        },
        tx
      );

      // Create a membership for the ghost user
      await projectMembershipDAL.create(
        {
          projectId: project.id,
          userId: ghostUser.user.id,
          role: ProjectMembershipRole.Admin
        },
        tx
      );

      // If a bot already exists, delete it
      if (existingBot) {
        console.log("Deleting existing bot");
        await projectBotDAL.delete({ id: existingBot.id }, tx);
      }

      console.log("Deleting old project keys");
      // Delete all the existing project keys
      await projectKeyDAL.delete(
        {
          projectId: project.id,
          $in: {
            id: existingProjectKeys.map((key) => key.id)
          }
        },
        tx
      );

      console.log("Finding latest key for ghost user");
      const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.user.id, project.id, tx);

      if (!ghostUserLatestKey) {
        throw new Error("User latest key not found (V2 Upgrade)");
      }

      console.log("Creating new project keys for old members");

      const newProjectMembers: {
        encryptedKey: string;
        nonce: string;
        senderId: string;
        receiverId: string;
        projectId: string;
      }[] = [];

      for (const key of existingProjectKeys) {
        const user = await userDAL.findUserEncKeyByUserId(key.receiverId);
        const [orgMembership] = await orgDAL.findMembership({ userId: key.receiverId, orgId: project.orgId });

        if (!user || !orgMembership) {
          throw new Error(`User with ID ${key.receiverId} was not found during upgrade, or user is not in org.`);
        }

        const [newMember] = createWsMembers({
          decryptKey: ghostUserLatestKey,
          userPrivateKey: ghostUser.keys.plainPrivateKey,
          members: [
            {
              userPublicKey: user.publicKey,
              orgMembershipId: orgMembership.id,
              projectMembershipRole: ProjectMembershipRole.Admin
            }
          ]
        });

        newProjectMembers.push({
          encryptedKey: newMember.workspaceEncryptedKey,
          nonce: newMember.workspaceEncryptedNonce,
          senderId: ghostUser.user.id,
          receiverId: user.id,
          projectId: project.id
        });
      }

      // Create project keys for all the old members
      await projectKeyDAL.insertMany(newProjectMembers, tx);

      // Encrypt the bot private key (which is the same as the ghost user)
      const { iv, tag, ciphertext, encoding, algorithm } = infisicalSymmetricEncypt(ghostUser.keys.plainPrivateKey);

      // 5. Create a bot for the project
      const newBot = await projectBotDAL.create(
        {
          name: "Infisical Bot (Ghost)",
          projectId: project.id,
          tag,
          iv,
          encryptedPrivateKey: ciphertext,
          isActive: true,
          publicKey: ghostUser.keys.publicKey,
          senderId: ghostUser.user.id,
          encryptedProjectKey: newEncryptedProjectKey,
          encryptedProjectKeyNonce: newEncryptedProjectKeyIv,
          algorithm,
          keyEncoding: encoding
        },
        tx
      );

      console.log("Updating secrets with new project key");
      console.log("Got decrypted secrets");

      const botPrivateKey = infisicalSymmetricDecrypt({
        keyEncoding: newBot.keyEncoding as SecretKeyEncoding,
        iv: newBot.iv,
        tag: newBot.tag,
        ciphertext: newBot.encryptedPrivateKey
      });

      const botKey = decryptAsymmetric({
        ciphertext: newBot.encryptedProjectKey!,
        privateKey: botPrivateKey,
        nonce: newBot.encryptedProjectKeyNonce!,
        publicKey: ghostUser.keys.publicKey
      });

      type TPartialSecret = Pick<
        TSecrets,
        | "id"
        | "secretKeyCiphertext"
        | "secretKeyIV"
        | "secretKeyTag"
        | "secretValueCiphertext"
        | "secretValueIV"
        | "secretValueTag"
        | "secretCommentCiphertext"
        | "secretCommentIV"
        | "secretCommentTag"
      >;

      const updatedSecrets: TPartialSecret[] = [];
      const updatedSecretVersions: TPartialSecret[] = [];
      const updatedSecretApprovals: TPartialSecret[] = [];
      for (const rawSecret of decryptedSecrets) {
        const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8(rawSecret.secretKey, botKey);
        const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8(rawSecret.secretValue || "", botKey);
        const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8(rawSecret.secretComment || "", botKey);

        const payload = {
          id: rawSecret.id,
          secretKeyCiphertext: secretKeyEncrypted.ciphertext,
          secretKeyIV: secretKeyEncrypted.iv,
          secretKeyTag: secretKeyEncrypted.tag,
          secretValueCiphertext: secretValueEncrypted.ciphertext,
          secretValueIV: secretValueEncrypted.iv,
          secretValueTag: secretValueEncrypted.tag,
          secretCommentCiphertext: secretCommentEncrypted.ciphertext,
          secretCommentIV: secretCommentEncrypted.iv,
          secretCommentTag: secretCommentEncrypted.tag
        } as const;

        if (rawSecret.docType === SecretDocType.Secret) {
          updatedSecrets.push(payload);
        } else if (rawSecret.docType === SecretDocType.SecretVersion) {
          updatedSecretVersions.push(payload);
        } else if (rawSecret.docType === SecretDocType.ApprovalSecret) {
          updatedSecretApprovals.push(payload);
        } else {
          throw new Error("Unknown secret type");
        }
      }

      const secretUpdates = await secretDAL.bulkUpdateNoVersionIncrement(
        [
          ...updatedSecrets.map((secret) => ({
            filter: { id: secret.id },
            data: {
              ...secret,
              id: undefined
            }
          }))
        ],
        tx
      );

      const secretVersionUpdates = await secretVersionDAL.bulkUpdateNoVersionIncrement(
        [
          ...updatedSecretVersions.map((version) => ({
            filter: { id: version.id },
            data: {
              ...version,
              id: undefined
            }
          }))
        ],
        tx
      );

      const secretApprovalUpdates = await secretApprovalSecretDAL.bulkUpdateNoVersionIncrement(
        [
          ...updatedSecretApprovals.map((approval) => ({
            filter: {
              id: approval.id
            },
            data: {
              ...approval,
              id: undefined
            }
          }))
        ],
        tx
      );

      if (secretUpdates.length !== updatedSecrets.length) {
        throw new Error("Failed to update some secrets");
      }
      if (secretVersionUpdates.length !== updatedSecretVersions.length) {
        throw new Error("Failed to update some secret versions");
      }
      if (secretApprovalUpdates.length !== updatedSecretApprovals.length) {
        throw new Error("Failed to update some secret approvals");
      }

      throw new Error("Transaction was successful");
    });
  };

  return {
    createProject,
    deleteProject,
    getProjects,
    findProjectGhostUser,
    getAProject,
    toggleAutoCapitalization,
    updateName,
    upgradeProject
  };
};
