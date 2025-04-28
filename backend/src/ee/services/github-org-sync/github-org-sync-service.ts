import { ForbiddenError } from "@casl/ability";
import { Octokit } from "@octokit/core";
import { paginateGraphQL } from "@octokit/plugin-paginate-graphql";
import { Octokit as OctokitRest } from "@octokit/rest";

import { OrgMembershipRole } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TGroupDALFactory } from "../group/group-dal";
import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TGithubOrgSyncDALFactory } from "./github-org-sync-dal";
import { TCreateGithubOrgSyncDTO, TDeleteGithubOrgSyncDTO, TUpdateGithubOrgSyncDTO } from "./github-org-sync-types";

const OctokitWithPlugin = Octokit.plugin(paginateGraphQL);

type TGithubOrgSyncServiceFactoryDep = {
  githubOrgSyncDAL: TGithubOrgSyncDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "findGroupMembershipsByUserIdInOrg" | "insertMany" | "delete"
  >;
  groupDAL: Pick<TGroupDALFactory, "insertMany" | "transaction" | "find">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TGithubOrgSyncServiceFactory = ReturnType<typeof githubOrgSyncServiceFactory>;

export const githubOrgSyncServiceFactory = ({
  githubOrgSyncDAL,
  permissionService,
  kmsService,
  userGroupMembershipDAL,
  groupDAL,
  licenseService
}: TGithubOrgSyncServiceFactoryDep) => {
  const createGithubOrgSync = async ({
    githubOrgName,
    orgPermission,
    githubOrgAccessToken,
    isActive
  }: TCreateGithubOrgSyncDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.GithubOrgSync);
    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.githubOrgSync) {
      throw new BadRequestError({
        message:
          "Failed to create github organization team sync due to plan restriction. Upgrade plan to create github organization sync."
      });
    }

    const existingConfig = await githubOrgSyncDAL.findOne({ orgId: orgPermission.orgId });
    if (existingConfig)
      throw new BadRequestError({
        message: `Organization ${orgPermission.orgId} already has GitHub Organization sync config.`
      });

    const octokit = new OctokitRest({
      auth: githubOrgAccessToken,
      request: {
        signal: AbortSignal.timeout(5000)
      }
    });
    const { data } = await octokit.rest.orgs.get({
      org: githubOrgName
    });
    if (data.login.toLowerCase() !== githubOrgName.toLowerCase())
      throw new BadRequestError({ message: "Invalid GitHub organisation" });

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgPermission.orgId
    });

    const config = await githubOrgSyncDAL.create({
      orgId: orgPermission.orgId,
      githubOrgName,
      isActive,
      encryptedGithubOrgAccessToken: githubOrgAccessToken
        ? encryptor({ plainText: Buffer.from(githubOrgAccessToken) }).cipherTextBlob
        : null
    });

    return config;
  };

  const updateGithubOrgSync = async ({
    githubOrgName,
    orgPermission,
    githubOrgAccessToken,
    isActive
  }: TUpdateGithubOrgSyncDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.GithubOrgSync);
    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.githubOrgSync) {
      throw new BadRequestError({
        message:
          "Failed to update github organization team sync due to plan restriction. Upgrade plan to update github organization sync."
      });
    }

    const existingConfig = await githubOrgSyncDAL.findOne({ orgId: orgPermission.orgId });
    if (!existingConfig)
      throw new BadRequestError({
        message: `Organization ${orgPermission.orgId} GitHub organization sync config missing.`
      });

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgPermission.orgId
    });
    const newData = {
      githubOrgName: githubOrgName || existingConfig.githubOrgName,
      githubOrgAccessToken:
        githubOrgAccessToken ||
        (existingConfig.encryptedGithubOrgAccessToken
          ? decryptor({ cipherTextBlob: existingConfig.encryptedGithubOrgAccessToken }).toString()
          : null)
    };

    if (githubOrgName || githubOrgAccessToken) {
      const octokit = new OctokitRest({
        auth: newData.githubOrgAccessToken,
        request: {
          signal: AbortSignal.timeout(5000)
        }
      });
      const { data } = await octokit.rest.orgs.get({
        org: newData.githubOrgName
      });

      if (data.login.toLowerCase() !== newData.githubOrgName.toLowerCase())
        throw new BadRequestError({ message: "Invalid GitHub organisation" });
    }

    const config = await githubOrgSyncDAL.updateById(existingConfig.id, {
      orgId: orgPermission.orgId,
      githubOrgName: newData.githubOrgName,
      isActive,
      encryptedGithubOrgAccessToken: newData.githubOrgAccessToken
        ? encryptor({ plainText: Buffer.from(newData.githubOrgAccessToken) }).cipherTextBlob
        : null
    });

    return config;
  };

  const deleteGithubOrgSync = async ({ orgPermission }: TDeleteGithubOrgSyncDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.GithubOrgSync);

    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.githubOrgSync) {
      throw new BadRequestError({
        message:
          "Failed to delete github organization team sync due to plan restriction. Upgrade plan to delete github organization sync."
      });
    }

    const existingConfig = await githubOrgSyncDAL.findOne({ orgId: orgPermission.orgId });
    if (!existingConfig)
      throw new BadRequestError({
        message: `Organization ${orgPermission.orgId} GitHub organization sync config missing.`
      });

    const config = await githubOrgSyncDAL.deleteById(existingConfig.id);

    return config;
  };

  const getGithubOrgSync = async ({ orgPermission }: TDeleteGithubOrgSyncDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.GithubOrgSync);

    const existingConfig = await githubOrgSyncDAL.findOne({ orgId: orgPermission.orgId });
    if (!existingConfig)
      throw new NotFoundError({
        message: `Organization ${orgPermission.orgId} GitHub organization sync config missing.`
      });

    return existingConfig;
  };

  const syncUserGroups = async (orgId: string, userId: string, accessToken: string) => {
    const config = await githubOrgSyncDAL.findOne({ orgId });
    if (!config || !config?.isActive) return;

    const infisicalUserGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(userId, orgId);
    const infisicalUserGroupSet = new Set(infisicalUserGroups.map((el) => el.groupName));

    const octoRest = new OctokitRest({
      auth: accessToken,
      request: {
        signal: AbortSignal.timeout(5000)
      }
    });
    const { data: userOrgMembershipDetails } = await octoRest.rest.orgs
      .getMembershipForAuthenticatedUser({
        org: config.githubOrgName
      })
      .catch((err) => {
        logger.error(err, "User not part of GitHub synced organization");
        throw new BadRequestError({ message: "User not part of GitHub synced organization" });
      });
    const username = userOrgMembershipDetails?.user?.login;
    if (!username) throw new BadRequestError({ message: "User not part of GitHub synced organization" });

    const octokit = new OctokitWithPlugin({
      auth: accessToken,
      request: {
        signal: AbortSignal.timeout(5000)
      }
    });
    const data = await octokit.graphql
      .paginate<{
        organization: { teams: { totalCount: number; edges: { node: { name: string; description: string } }[] } };
      }>(
        `
      query orgTeams($cursor: String,$org: String!, $username: String!){
        organization(login: $org) {
          teams(first: 100, userLogins: [$username], after: $cursor) {
            totalCount
            edges {
              node {
                name
                description
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
      `,
        {
          org: config.githubOrgName,
          username
        }
      )
      .catch((err) => {
        if ((err as Error)?.message?.includes("Although you appear to have the correct authorization credential")) {
          throw new BadRequestError({
            message:
              "Please check your organization have approved Infisical Oauth application. For more info: https://infisical.com/docs/documentation/platform/github-org-sync#troubleshooting"
          });
        }
        throw new BadRequestError({ message: (err as Error)?.message });
      });

    const {
      organization: { teams }
    } = data;
    const githubUserTeams = teams?.edges?.map((el) => el.node.name.toLowerCase()) || [];
    const githubUserTeamSet = new Set(githubUserTeams);
    const githubUserTeamOnInfisical = await groupDAL.find({ orgId, $in: { name: githubUserTeams } });
    const githubUserTeamOnInfisicalGroupByName = groupBy(githubUserTeamOnInfisical, (i) => i.name);

    const newTeams = githubUserTeams.filter(
      (el) => !infisicalUserGroupSet.has(el) && !Object.hasOwn(githubUserTeamOnInfisicalGroupByName, el)
    );
    const updateTeams = githubUserTeams.filter(
      (el) => !infisicalUserGroupSet.has(el) && Object.hasOwn(githubUserTeamOnInfisicalGroupByName, el)
    );
    const removeFromTeams = infisicalUserGroups.filter((el) => !githubUserTeamSet.has(el.groupName));

    if (newTeams.length || updateTeams.length || removeFromTeams.length) {
      await groupDAL.transaction(async (tx) => {
        if (newTeams.length) {
          const newGroups = await groupDAL.insertMany(
            newTeams.map((newGroupName) => ({
              name: newGroupName,
              role: OrgMembershipRole.Member,
              slug: newGroupName,
              orgId
            })),
            tx
          );
          await userGroupMembershipDAL.insertMany(
            newGroups.map((el) => ({
              groupId: el.id,
              userId
            })),
            tx
          );
        }

        if (updateTeams.length) {
          await userGroupMembershipDAL.insertMany(
            updateTeams.map((el) => ({
              groupId: githubUserTeamOnInfisicalGroupByName[el][0].id,
              userId
            })),
            tx
          );
        }

        if (removeFromTeams.length) {
          await userGroupMembershipDAL.delete(
            { userId, $in: { groupId: removeFromTeams.map((el) => el.groupId) } },
            tx
          );
        }
      });
    }
  };

  return {
    createGithubOrgSync,
    updateGithubOrgSync,
    deleteGithubOrgSync,
    getGithubOrgSync,
    syncUserGroups
  };
};
