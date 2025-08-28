/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import { Octokit } from "@octokit/core";
import { paginateGraphql } from "@octokit/plugin-paginate-graphql";
import { Octokit as OctokitRest } from "@octokit/rest";

import { OrgMembershipRole } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { TIdentityMetadataDALFactory } from "@app/services/identity/identity-metadata-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
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
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "find">;
  identityMetadataDAL: TIdentityMetadataDALFactory;
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
  identityMetadataDAL
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
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.GithubOrgSync);

    const plan = await licenseService.getPlan(orgPermission.orgId);
    if (!plan.githubOrgSync) {
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
            message: "GitHub access token lacks required permissions. Ensure it has 'read:org' and 'read:user' scopes."
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

  const syncAllTeams = async ({ orgPermission, githubOrgAccessToken }: TSyncAllTeamsDTO): Promise<TSyncResult> => {
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
          "Failed to sync all GitHub teams due to plan restriction. Upgrade plan to use GitHub organization sync."
      });
    }

    const config = await githubOrgSyncDAL.findOne({ orgId: orgPermission.orgId });
    if (!config || !config?.isActive) {
      throw new BadRequestError({ message: "GitHub organization sync is not configured or not active" });
    }

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgPermission.orgId
    });

    let orgAccessToken: string;
    let shouldUpdateStoredToken = false;

    // If a new token is provided, use it and update the stored token
    if (githubOrgAccessToken) {
      orgAccessToken = githubOrgAccessToken;
      shouldUpdateStoredToken = true;
    } else if (config.encryptedGithubOrgAccessToken) {
      // Use the stored token
      orgAccessToken = decryptor({ cipherTextBlob: config.encryptedGithubOrgAccessToken }).toString();
    } else {
      throw new BadRequestError({
        message: "GitHub organization access token is required for bulk sync. Please provide a token."
      });
    }

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

      if (shouldUpdateStoredToken) {
        await githubOrgSyncDAL.updateById(config.id, {
          encryptedGithubOrgAccessToken: encryptor({ plainText: Buffer.from(orgAccessToken) }).cipherTextBlob
        });
      }
    } catch (error) {
      if (!githubOrgAccessToken && config.encryptedGithubOrgAccessToken) {
        throw new BadRequestError({
          message: "Stored GitHub access token is invalid or expired. Please provide a new token."
        });
      }
      throw new BadRequestError({
        message: `Invalid GitHub access token or insufficient permissions: ${(error as Error).message}`
      });
    }

    // Get all organization members
    const orgMembers = await orgMembershipDAL.find({ orgId: orgPermission.orgId });
    const activeMembers = orgMembers.filter((member) => member.status === "accepted" && member.isActive);

    // Get GitHub usernames from metadata for all users
    const userMetadata = await identityMetadataDAL.find({
      orgId: orgPermission.orgId,
      key: "github_username"
    });

    const githubUsernameMap = new Map<string, string>();
    userMetadata.forEach((meta) => {
      if (meta.userId) {
        githubUsernameMap.set(meta.userId, meta.value);
      }
    });

    const startTime = Date.now();
    let syncedUsersCount = 0;
    const syncErrors: string[] = [];
    const createdTeams = new Set<string>();
    const updatedTeams = new Set<string>();
    let totalRemovedMemberships = 0;

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(() => resolve(), ms);
      });

    const retryWithBackoff = async <T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> => {
      let lastError: Error;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;
          const gitHubError = error as GitHubApiError;
          const statusCode = gitHubError.status || gitHubError.response?.status;
          if (statusCode === 403) {
            const rateLimitReset = gitHubError.response?.headers?.["x-ratelimit-reset"];
            if (rateLimitReset) {
              const resetTime = parseInt(rateLimitReset, 10) * 1000;
              const waitTime = Math.max(resetTime - Date.now(), baseDelay);
              logger.warn(`Rate limit hit, waiting ${waitTime}ms until reset`);
              await delay(Math.min(waitTime, 60000)); // Cap at 1 minute
            } else {
              await delay(baseDelay * 2 ** attempt);
            }
          } else if (attempt < maxRetries) {
            await delay(baseDelay * 2 ** attempt);
          }
        }
      }

      throw lastError!;
    };

    const RATE_LIMIT_DELAY = 150;

    const octokit = new OctokitWithPlugin({
      auth: orgAccessToken,
      request: {
        signal: AbortSignal.timeout(30000)
      }
    });

    const syncUserGroupsWithStoredUsername = async (
      orgId: string,
      userId: string,
      githubUsername: string,
      githubOrgName: string,
      octokitInstance: InstanceType<typeof OctokitWithPlugin>
    ): Promise<{ createdTeams: string[]; updatedTeams: string[]; removedMemberships: number } | null> => {
      const infisicalUserGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(userId, orgId);
      const infisicalUserGroupSet = new Set(infisicalUserGroups.map((el) => el.groupName));

      const data = await octokitInstance.graphql
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
            org: githubOrgName,
            username: githubUsername
          }
        )
        .catch((err) => {
          logger.error(err, `GitHub GraphQL error for user ${githubUsername}`);

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
                  "GitHub access token lacks required permissions. Please ensure the token has 'read:org' and 'read:user' scopes."
              });
            }
            if (statusCode === 404) {
              throw new BadRequestError({
                message: `Organization ${config.githubOrgName} not found or user ${githubUsername} is not a member.`
              });
            }
          }

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
        (el) => !infisicalUserGroupSet.has(el) && !(el in githubUserTeamOnInfisicalGroupByName)
      );
      const updateTeams = githubUserTeams.filter(
        (el) => !infisicalUserGroupSet.has(el) && el in githubUserTeamOnInfisicalGroupByName
      );
      const removeFromTeams = infisicalUserGroups.filter((el) => !githubUserTeamSet.has(el.groupName));

      if (newTeams.length || updateTeams.length || removeFromTeams.length) {
        const result = {
          createdTeams: [] as string[],
          updatedTeams: [] as string[],
          removedMemberships: 0
        };

        try {
          if (newTeams.length) {
            await groupDAL.transaction(async (tx) => {
              logger.info({ userId, githubUsername, newTeams, orgId }, "Creating new teams for user");

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
            });

            result.createdTeams = newTeams;
          }

          if (updateTeams.length) {
            await groupDAL.transaction(async (tx) => {
              logger.info({ userId, githubUsername, updateTeams, orgId }, "Adding user to existing teams");

              await userGroupMembershipDAL.insertMany(
                updateTeams.map((el) => ({
                  groupId: githubUserTeamOnInfisicalGroupByName[el][0].id,
                  userId
                })),
                tx
              );
            });

            result.updatedTeams = updateTeams;
          }

          if (removeFromTeams.length) {
            await groupDAL.transaction(async (tx) => {
              logger.info(
                { userId, githubUsername, removeFromTeams: removeFromTeams.map((t) => t.groupName), orgId },
                "Removing user from teams"
              );

              await userGroupMembershipDAL.delete(
                { userId, $in: { groupId: removeFromTeams.map((el) => el.groupId) } },
                tx
              );
            });

            result.removedMemberships = removeFromTeams.length;
          }

          return result;
        } catch (error) {
          logger.error(error, `Failed to update team memberships for user ${userId} (${githubUsername})`);
          throw error;
        }
      }

      return null;
    };

    for (const member of activeMembers) {
      try {
        if (!member.userId) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const githubUsername = githubUsernameMap.get(member.userId);

        if (!githubUsername) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const syncResult = await retryWithBackoff(async () => {
          return syncUserGroupsWithStoredUsername(
            orgPermission.orgId,
            member.userId!,
            githubUsername,
            config.githubOrgName,
            octokit
          );
        });

        if (syncResult) {
          syncResult.createdTeams.forEach((team) => createdTeams.add(team));
          syncResult.updatedTeams.forEach((team) => updatedTeams.add(team));
          totalRemovedMemberships += syncResult.removedMemberships;
        }

        syncedUsersCount += 1;

        await delay(RATE_LIMIT_DELAY);
      } catch (error) {
        logger.error(error, `Failed to sync teams for user ${member.userId || "unknown"}`);
        syncErrors.push(`User ${member.userId || "unknown"}: ${(error as Error).message}`);
      }
    }

    const syncDuration = Date.now() - startTime;

    logger.info(
      {
        orgId: orgPermission.orgId,
        syncedUsersCount,
        totalUsers: activeMembers.length,
        createdTeams: createdTeams.size,
        updatedTeams: updatedTeams.size,
        removedMemberships: totalRemovedMemberships,
        syncDuration,
        errorCount: syncErrors.length
      },
      "GitHub team sync completed"
    );

    return {
      syncedUsersCount,
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
