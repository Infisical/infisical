/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import { Octokit } from "@octokit/core";
import { paginateGraphql } from "@octokit/plugin-paginate-graphql";
import { Octokit as OctokitRest } from "@octokit/rest";
import RE2 from "re2";

import { AccessScope, OrganizationActionScope, OrgMembershipRole, SubscriptionProductCategory } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { retryWithBackoff } from "@app/lib/retry";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMembershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";

import { TGroupDALFactory } from "../group/group-dal";
import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TGithubOrgSyncDALFactory } from "./github-org-sync-dal";
import {
  TCreateGithubOrgSyncDTO,
  TDeleteGithubOrgSyncDTO,
  TSyncAllTeamsDTO,
  TSyncResult,
  TUpdateGithubOrgSyncDTO,
  TValidateGithubTokenDTO
} from "./github-org-sync-types";

const OctokitWithPlugin = Octokit.plugin(paginateGraphql);

// Type definitions for GitHub API errors
interface GitHubApiError extends Error {
  status?: number;
  response?: {
    status?: number;
    headers?: {
      "x-ratelimit-reset"?: string;
    };
  };
}

interface OrgMembershipWithUser {
  id: string;
  orgId: string;
  role: string;
  status: string;
  isActive: boolean;
  inviteEmail: string | null;
  user: {
    id: string;
    email: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface GroupMembership {
  id: string;
  groupId: string;
  groupName: string;
  orgMembershipId: string;
  firstName: string | null;
  lastName: string | null;
}

type TGithubOrgSyncServiceFactoryDep = {
  githubOrgSyncDAL: TGithubOrgSyncDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "findGroupMembershipsByUserIdInOrg" | "findGroupMembershipsByGroupIdInOrg" | "insertMany" | "delete"
  >;
  groupDAL: Pick<TGroupDALFactory, "insertMany" | "transaction" | "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "insertMany">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "findOrgMembershipById" | "findOrgMembershipsWithUsersByOrgId">;
};

export type TGithubOrgSyncServiceFactory = ReturnType<typeof githubOrgSyncServiceFactory>;

export const githubOrgSyncServiceFactory = ({
  githubOrgSyncDAL,
  permissionService,
  kmsService,
  userGroupMembershipDAL,
  groupDAL,
  licenseService,
  orgMembershipDAL,
  membershipRoleDAL,
  membershipGroupDAL
}: TGithubOrgSyncServiceFactoryDep) => {
  const createGithubOrgSync = async ({
    githubOrgName,
    orgPermission,
    githubOrgAccessToken,
    isActive
  }: TCreateGithubOrgSyncDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.GithubOrgSync);
    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.get(SubscriptionProductCategory.Platform, "githubOrgSync")) {
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
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      scope: OrganizationActionScope.ParentOrganization,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.GithubOrgSync);
    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.get(SubscriptionProductCategory.Platform, "githubOrgSync")) {
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
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.GithubOrgSync);

    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.get(SubscriptionProductCategory.Platform, "githubOrgSync")) {
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
    const { permission } = await permissionService.getOrgPermission({
      actorId: orgPermission.id,
      actor: orgPermission.type,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

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
      if (newTeams.length) {
        await groupDAL.transaction(async (tx) => {
          const newGroups = await groupDAL.insertMany(
            newTeams.map((newGroupName) => ({
              name: newGroupName,
              role: OrgMembershipRole.Member,
              slug: newGroupName,
              orgId
            })),
            tx
          );
          const memberships = await membershipGroupDAL.insertMany(
            newGroups.map((el) => ({
              actorGroupId: el.id,
              scope: AccessScope.Organization,
              scopeOrgId: orgId
            })),
            tx
          );

          await membershipRoleDAL.insertMany(
            memberships.map((el) => ({
              membershipId: el.id,
              role: OrgMembershipRole.Member
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
        });
      }

      if (updateTeams.length) {
        await groupDAL.transaction(async (tx) => {
          await userGroupMembershipDAL.insertMany(
            updateTeams.map((el) => ({
              groupId: githubUserTeamOnInfisicalGroupByName[el][0].id,
              userId
            })),
            tx
          );
        });
      }

      if (removeFromTeams.length) {
        await groupDAL.transaction(async (tx) => {
          await userGroupMembershipDAL.delete(
            { userId, $in: { groupId: removeFromTeams.map((el) => el.groupId) } },
            tx
          );
        });
      }
    }
  };

  const validateGithubToken = async ({ orgPermission, githubOrgAccessToken }: TValidateGithubTokenDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId: orgPermission.id,
      actor: orgPermission.type,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.GithubOrgSync);

    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.get(SubscriptionProductCategory.Platform, "githubOrgSync")) {
      throw new BadRequestError({
        message:
          "Failed to validate GitHub token due to plan restriction. Upgrade plan to use GitHub organization sync."
      });
    }

    const config = await githubOrgSyncDAL.findOne({ orgId: orgPermission.orgId });
    if (!config) {
      throw new BadRequestError({ message: "GitHub organization sync is not configured" });
    }

    try {
      const testOctokit = new OctokitRest({
        auth: githubOrgAccessToken,
        request: {
          signal: AbortSignal.timeout(10000)
        }
      });

      const { data: org } = await testOctokit.rest.orgs.get({
        org: config.githubOrgName
      });

      const octokitGraphQL = new OctokitWithPlugin({
        auth: githubOrgAccessToken,
        request: {
          signal: AbortSignal.timeout(10000)
        }
      });

      await octokitGraphQL.graphql(`query($org: String!) { organization(login: $org) { id name } }`, {
        org: config.githubOrgName
      });

      return {
        valid: true,
        organizationInfo: {
          id: org.id,
          login: org.login,
          name: org.name || org.login,
          publicRepos: org.public_repos,
          privateRepos: org.owned_private_repos || 0
        }
      };
    } catch (error) {
      logger.error(error, `GitHub token validation failed for org ${config.githubOrgName}`);

      const gitHubError = error as GitHubApiError;
      const statusCode = gitHubError.status || gitHubError.response?.status;
      if (statusCode) {
        if (statusCode === 401) {
          throw new BadRequestError({
            message: "GitHub access token is invalid or expired."
          });
        }
        if (statusCode === 403) {
          throw new BadRequestError({
            message:
              "GitHub access token lacks required permissions. Required: 1) 'read:org' scope for organization teams, 2) Token owner must be an organization member with team visibility access, 3) Organization settings must allow team visibility. Check GitHub token scopes and organization member permissions."
          });
        }
        if (statusCode === 404) {
          throw new BadRequestError({
            message: `Organization '${config.githubOrgName}' not found or access token does not have access to it.`
          });
        }
      }

      throw new BadRequestError({
        message: `GitHub token validation failed: ${(error as Error).message}`
      });
    }
  };

  const syncAllTeams = async ({ orgPermission }: TSyncAllTeamsDTO): Promise<TSyncResult> => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor: orgPermission.type,
      orgId: orgPermission.orgId,
      actorId: orgPermission.id,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.GithubOrgSyncManual
    );

    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.get(SubscriptionProductCategory.Platform, "githubOrgSync")) {
      throw new BadRequestError({
        message:
          "Failed to sync all GitHub teams due to plan restriction. Upgrade plan to use GitHub organization sync."
      });
    }

    const config = await githubOrgSyncDAL.findOne({ orgId: orgPermission.orgId });
    if (!config || !config?.isActive) {
      throw new BadRequestError({ message: "GitHub organization sync is not configured or not active" });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgPermission.orgId
    });

    if (!config.encryptedGithubOrgAccessToken) {
      throw new BadRequestError({
        message: "GitHub organization access token is required. Please set a token first."
      });
    }

    const orgAccessToken = decryptor({ cipherTextBlob: config.encryptedGithubOrgAccessToken }).toString();

    try {
      const testOctokit = new OctokitRest({
        auth: orgAccessToken,
        request: {
          signal: AbortSignal.timeout(10000)
        }
      });

      await testOctokit.rest.orgs.get({
        org: config.githubOrgName
      });

      await testOctokit.rest.users.getAuthenticated();
    } catch (error) {
      throw new BadRequestError({
        message: "Stored GitHub access token is invalid or expired. Please set a new token."
      });
    }

    const allMembers = await orgMembershipDAL.findOrgMembershipsWithUsersByOrgId(orgPermission.orgId);
    const activeMembers = allMembers.filter(
      (member) => member.status === "accepted" && member.isActive
    ) as OrgMembershipWithUser[];

    const startTime = Date.now();
    const syncErrors: string[] = [];

    const octokit = new OctokitWithPlugin({
      auth: orgAccessToken,
      request: {
        signal: AbortSignal.timeout(30000)
      }
    });

    const data = await retryWithBackoff(async () => {
      return octokit.graphql
        .paginate<{
          organization: {
            teams: {
              totalCount: number;
              edges: {
                node: {
                  name: string;
                  description: string;
                  members: {
                    edges: {
                      node: {
                        login: string;
                      };
                    }[];
                  };
                };
              }[];
            };
          };
        }>(
          `
        query orgTeams($cursor: String, $org: String!) {
          organization(login: $org) {
            teams(first: 100, after: $cursor) {
              totalCount
              edges {
                node {
                  name
                  description
                  members(first: 100) {
                    edges {
                      node {
                        login
                      }
                    }
                  }
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
            org: config.githubOrgName
          }
        )
        .catch((err) => {
          logger.error(err, "GitHub GraphQL error for batched team sync");

          const gitHubError = err as GitHubApiError;
          const statusCode = gitHubError.status || gitHubError.response?.status;
          if (statusCode) {
            if (statusCode === 401) {
              throw new BadRequestError({
                message: "GitHub access token is invalid or expired. Please provide a new token."
              });
            }
            if (statusCode === 403) {
              throw new BadRequestError({
                message:
                  "GitHub access token lacks required permissions for organization team sync. Required: 1) 'admin:org' scope, 2) Token owner must be organization owner or have team read permissions, 3) Organization settings must allow team visibility. Check token scopes and user role."
              });
            }
            if (statusCode === 404) {
              throw new BadRequestError({
                message: `Organization ${config.githubOrgName} not found or access token does not have sufficient permissions to read it.`
              });
            }
          }

          if ((err as Error)?.message?.includes("Although you appear to have the correct authorization credential")) {
            throw new BadRequestError({
              message:
                "Organization has restricted OAuth app access. Please check that: 1) Your organization has approved the Infisical OAuth application, 2) The token owner has sufficient organization permissions."
            });
          }
          throw new BadRequestError({ message: `GitHub GraphQL query failed: ${(err as Error)?.message}` });
        });
    });

    const {
      organization: { teams }
    } = data;

    const userTeamMap = new Map<string, string[]>();
    const allGithubUsernamesInTeams = new Set<string>();

    teams?.edges?.forEach((teamEdge) => {
      const teamName = teamEdge.node.name.toLowerCase();

      teamEdge.node.members.edges.forEach((memberEdge) => {
        const username = memberEdge.node.login.toLowerCase();
        allGithubUsernamesInTeams.add(username);

        if (!userTeamMap.has(username)) {
          userTeamMap.set(username, []);
        }
        userTeamMap.get(username)!.push(teamName);
      });
    });

    const allGithubTeamNames = Array.from(new Set(teams?.edges?.map((edge) => edge.node.name.toLowerCase()) || []));

    const existingTeamsOnInfisical = await groupDAL.find({
      orgId: orgPermission.orgId,
      $in: { name: allGithubTeamNames }
    });
    const existingTeamsMap = groupBy(existingTeamsOnInfisical, (i) => i.name);

    const teamsToCreate = allGithubTeamNames.filter((teamName) => !(teamName in existingTeamsMap));
    const createdTeams = new Set<string>();
    const updatedTeams = new Set<string>();
    const totalRemovedMemberships = 0;

    await groupDAL.transaction(async (tx) => {
      if (teamsToCreate.length > 0) {
        const newGroups = await groupDAL.insertMany(
          teamsToCreate.map((teamName) => ({
            name: teamName,
            role: OrgMembershipRole.Member,
            slug: teamName,
            orgId: orgPermission.orgId
          })),
          tx
        );

        const memberships = await membershipGroupDAL.insertMany(
          newGroups.map((el) => ({
            actorGroupId: el.id,
            scope: AccessScope.Organization,
            scopeOrgId: orgPermission.orgId
          })),
          tx
        );

        await membershipRoleDAL.insertMany(
          memberships.map((el) => ({
            membershipId: el.id,
            role: OrgMembershipRole.Member
          })),
          tx
        );

        newGroups.forEach((group) => {
          if (!existingTeamsMap[group.name]) {
            existingTeamsMap[group.name] = [];
          }
          existingTeamsMap[group.name].push(group);
          createdTeams.add(group.name);
        });
      }

      const allTeams = [...Object.values(existingTeamsMap).flat()];

      for (const team of allTeams) {
        const teamName = team.name.toLowerCase();

        const currentMemberships = (await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(
          team.id,
          orgPermission.orgId
        )) as GroupMembership[];

        const expectedUserIds = new Set<string>();
        teams?.edges?.forEach((teamEdge) => {
          if (teamEdge.node.name.toLowerCase() === teamName) {
            teamEdge.node.members.edges.forEach((memberEdge) => {
              const githubUsername = memberEdge.node.login.toLowerCase();

              const matchingMember = activeMembers.find((member) => {
                const email = member.user?.email || member.inviteEmail;
                if (!email) return false;

                const emailPrefix = email.split("@")[0].toLowerCase();
                const emailDomain = email.split("@")[1].toLowerCase();

                if (emailPrefix === githubUsername) {
                  return true;
                }
                const domainName = emailDomain.split(".")[0];
                if (githubUsername.endsWith(domainName) && githubUsername.length > domainName.length) {
                  const baseUsername = githubUsername.slice(0, -domainName.length);
                  if (emailPrefix === baseUsername) {
                    return true;
                  }
                }
                const emailSplitRegex = new RE2(/[._-]/);
                const emailParts = emailPrefix.split(emailSplitRegex);
                const longestEmailPart = emailParts.reduce((a, b) => (a.length > b.length ? a : b), "");
                if (longestEmailPart.length >= 4 && githubUsername.includes(longestEmailPart)) {
                  return true;
                }
                return false;
              });

              if (matchingMember?.user?.id) {
                expectedUserIds.add(matchingMember.user.id);
                logger.info(
                  `Matched GitHub user ${githubUsername} to email ${matchingMember.user?.email || matchingMember.inviteEmail}`
                );
              }
            });
          }
        });

        const currentUserIds = new Set<string>();
        currentMemberships.forEach((membership) => {
          const activeMember = activeMembers.find((am) => am.id === membership.orgMembershipId);
          if (activeMember?.user?.id) {
            currentUserIds.add(activeMember.user.id);
          }
        });

        const usersToAdd = Array.from(expectedUserIds).filter((userId) => !currentUserIds.has(userId));

        const membershipsToRemove = currentMemberships.filter((membership) => {
          const activeMember = activeMembers.find((am) => am.id === membership.orgMembershipId);
          return activeMember?.user?.id && !expectedUserIds.has(activeMember.user.id);
        });

        if (usersToAdd.length > 0) {
          await userGroupMembershipDAL.insertMany(
            usersToAdd.map((userId) => ({
              userId,
              groupId: team.id
            })),
            tx
          );
          updatedTeams.add(teamName);
        }

        if (membershipsToRemove.length > 0) {
          await userGroupMembershipDAL.delete(
            {
              $in: {
                id: membershipsToRemove.map((m) => m.id)
              }
            },
            tx
          );
          updatedTeams.add(teamName);
        }
      }
    });

    const syncDuration = Date.now() - startTime;

    logger.info(
      {
        orgId: orgPermission.orgId,
        createdTeams: createdTeams.size,
        syncDuration
      },
      "GitHub team sync completed"
    );

    return {
      totalUsers: activeMembers.length,
      errors: syncErrors,
      createdTeams: Array.from(createdTeams),
      updatedTeams: Array.from(updatedTeams),
      removedMemberships: totalRemovedMemberships,
      syncDuration
    };
  };

  return {
    createGithubOrgSync,
    updateGithubOrgSync,
    deleteGithubOrgSync,
    getGithubOrgSync,
    syncUserGroups,
    syncAllTeams,
    validateGithubToken
  };
};
