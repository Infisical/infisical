/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import { Octokit } from "@octokit/core";
import { paginateGraphql } from "@octokit/plugin-paginate-graphql";
import { Octokit as OctokitRest } from "@octokit/rest";

import { AccessScope, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { retryWithBackoff } from "@app/lib/retry";
import { TAlertChannelRecipientDALFactory } from "@app/services/alert/alert-channel-recipient-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { AgentVaultIdentities, PamIdentities, SecretIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMembershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

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
  TSyncUserGroupsDTO,
  TUpdateGithubOrgSyncDTO,
  TValidateGithubTokenDTO
} from "./github-org-sync-types";

const OctokitWithPlugin = Octokit.plugin(paginateGraphql);

// The sync only reads from GitHub, so read:org is the whole requirement.
const githubTeamAccessDeniedMessage = (githubOrgName: string) =>
  `GitHub denied access to the teams in organization '${githubOrgName}'. A classic access token needs the 'read:org' scope. A fine-grained token needs Organization permissions > Members set to read, with the organization as its resource owner. GitHub also hides secret teams from anyone who is not an organization owner or a member of the team.`;

// GitHub 502s when one page resolves too many nodes, and nesting members under teams multiplies it.
const GITHUB_TEAMS_PAGE_SIZE = 20;
const GITHUB_TEAM_MEMBERS_PAGE_SIZE = 100;
const GITHUB_MAX_PAGES = 500;
const GITHUB_REQUEST_TIMEOUT_MS = 30_000;
const GITHUB_AUDIT_LOG_CONCURRENCY = 25;

type TGithubPageInfo = { hasNextPage: boolean; endCursor: string | null };

export type TGithubTeamMember = {
  login: string;
  databaseId: number | null;
};

type TGithubTeamMembersConnection = {
  edges: { node: TGithubTeamMember }[];
  pageInfo: TGithubPageInfo;
};

type TGithubOrgTeamsResponse = {
  organization: {
    teams: {
      edges: {
        node: {
          slug: string;
          name: string;
          description: string | null;
          members: TGithubTeamMembersConnection;
        };
      }[];
      pageInfo: TGithubPageInfo;
    };
  };
};

type TGithubTeamMembersResponse = {
  organization: {
    team: { members: TGithubTeamMembersConnection } | null;
  };
};

export type TGithubTeam = {
  slug: string;
  name: string;
  description: string | null;
  members: TGithubTeamMember[];
};

const ORG_TEAMS_QUERY = `
  query orgTeams($org: String!, $cursor: String, $teamsPageSize: Int!, $membersPageSize: Int!) {
    organization(login: $org) {
      teams(first: $teamsPageSize, after: $cursor) {
        edges {
          node {
            slug
            name
            description
            members(first: $membersPageSize) {
              edges {
                node {
                  login
                  databaseId
                }
              }
              pageInfo {
                hasNextPage
                endCursor
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
`;

const TEAM_MEMBERS_QUERY = `
  query teamMembers($org: String!, $slug: String!, $cursor: String, $membersPageSize: Int!) {
    organization(login: $org) {
      team(slug: $slug) {
        members(first: $membersPageSize, after: $cursor) {
          edges {
            node {
              login
              databaseId
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

const nextCursor = (pageInfo: TGithubPageInfo) => (pageInfo.hasNextPage ? pageInfo.endCursor : null);

export const fetchGithubOrgTeams = async (octokit: Pick<Octokit, "graphql">, org: string): Promise<TGithubTeam[]> => {
  const graphql = <T>(query: string, variables: Record<string, string | number | null>) =>
    retryWithBackoff(() =>
      octokit.graphql<T>(query, {
        ...variables,
        request: { signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) }
      })
    );

  const teams: (TGithubTeam & { membersCursor: string | null })[] = [];

  let teamsCursor: string | null = null;
  let teamsPage = 0;
  do {
    const data: TGithubOrgTeamsResponse = await graphql<TGithubOrgTeamsResponse>(ORG_TEAMS_QUERY, {
      org,
      cursor: teamsCursor,
      teamsPageSize: GITHUB_TEAMS_PAGE_SIZE,
      membersPageSize: GITHUB_TEAM_MEMBERS_PAGE_SIZE
    });
    const connection = data.organization.teams;
    connection.edges.forEach(({ node }) => {
      teams.push({
        slug: node.slug,
        name: node.name,
        description: node.description,
        members: node.members.edges.map((edge) => edge.node),
        membersCursor: nextCursor(node.members.pageInfo)
      });
    });
    teamsCursor = nextCursor(connection.pageInfo);
    teamsPage += 1;
  } while (teamsCursor && teamsPage < GITHUB_MAX_PAGES);

  if (teamsCursor) {
    logger.warn({ org, fetchedTeams: teams.length }, "GitHub org team sync hit the page cap; team list truncated");
  }

  for (const team of teams) {
    let membersPage = 1;
    while (team.membersCursor && membersPage < GITHUB_MAX_PAGES) {
      const data: TGithubTeamMembersResponse = await graphql<TGithubTeamMembersResponse>(TEAM_MEMBERS_QUERY, {
        org,
        slug: team.slug,
        cursor: team.membersCursor,
        membersPageSize: GITHUB_TEAM_MEMBERS_PAGE_SIZE
      });
      const connection = data.organization.team?.members;
      if (!connection) {
        throw new BadRequestError({
          message: `GitHub team '${team.slug}' was renamed or deleted while its members were being listed. Please run the sync again.`
        });
      }
      team.members.push(...connection.edges.map((edge) => edge.node));
      team.membersCursor = nextCursor(connection.pageInfo);
      membersPage += 1;
    }

    if (team.membersCursor) {
      throw new BadRequestError({
        message: `GitHub team '${team.slug}' has more members than can be synced (${GITHUB_MAX_PAGES * GITHUB_TEAM_MEMBERS_PAGE_SIZE} member limit).`
      });
    }
  }

  return teams.map(({ slug, name, description, members }) => ({ slug, name, description, members }));
};

type TGithubAlias = {
  externalId: string;
  userId: string;
  isEmailVerified?: boolean | null;
};

export const buildGithubMemberMatcher = (aliases: TGithubAlias[], activeUserIds: Set<string>) => {
  const userIdByGithubId = new Map(
    aliases.flatMap((alias) =>
      alias.isEmailVerified === true && activeUserIds.has(alias.userId)
        ? ([[alias.externalId, alias.userId]] as const)
        : []
    )
  );

  return (member: TGithubTeamMember) =>
    member.databaseId === null ? undefined : userIdByGithubId.get(String(member.databaseId));
};

export const mapGithubTeamsByName = <T extends { name: string }>(teams: T[]) => {
  const teamsByName = new Map<string, T>();

  teams.forEach((team) => {
    const normalizedName = team.name.toLowerCase();
    const existingTeam = teamsByName.get(normalizedName);
    if (existingTeam) {
      throw new BadRequestError({
        message: `GitHub teams '${existingTeam.name}' and '${team.name}' both map to the Infisical group '${normalizedName}'. Rename one of the GitHub teams, then run the sync again. No group changes were applied.`
      });
    }
    teamsByName.set(normalizedName, team);
  });

  return teamsByName;
};

type TGithubOrgSyncAuditChange = {
  action: "add" | "remove";
  groupId: string;
  groupName: string;
  userId: string;
  username: string;
};

export const createGithubOrgSyncAuditLogs = async ({
  auditLogService,
  auditLogInfo,
  orgId,
  githubOrgName,
  syncTrigger,
  changes
}: {
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  auditLogInfo: AuditLogInfo;
  orgId: string;
  githubOrgName: string;
  syncTrigger: "login" | "manual";
  changes: TGithubOrgSyncAuditChange[];
}) => {
  for (let offset = 0; offset < changes.length; offset += GITHUB_AUDIT_LOG_CONCURRENCY) {
    const batch = changes.slice(offset, offset + GITHUB_AUDIT_LOG_CONCURRENCY);
    await Promise.all(
      batch.map((change) =>
        auditLogService.createAuditLog({
          ...auditLogInfo,
          orgId,
          event: {
            type: change.action === "add" ? EventType.ADD_USER_TO_GROUP : EventType.REMOVE_USER_FROM_GROUP,
            metadata: {
              groupId: change.groupId,
              groupName: change.groupName,
              userId: change.userId,
              username: change.username,
              source: "github-org-sync",
              githubOrgName,
              syncTrigger
            }
          }
        })
      )
    );
  }
};

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

export const assertGithubGroupMembersLinked = ({
  currentUserIds,
  linkedUserIds,
  activeUsers,
  noChangesApplied = false
}: {
  currentUserIds: Set<string>;
  linkedUserIds: Set<string>;
  activeUsers: { id: string; email: string }[];
  noChangesApplied?: boolean;
}) => {
  const unlinkedUserIds = [...currentUserIds].filter((userId) => !linkedUserIds.has(userId));
  if (!unlinkedUserIds.length) return;

  const emailsByUserId = new Map(activeUsers.map((user) => [user.id, user.email]));
  const reportLimit = 10;
  const listedMembers = unlinkedUserIds.slice(0, reportLimit).map((userId) => emailsByUserId.get(userId) ?? userId);
  const remainingCount = unlinkedUserIds.length - listedMembers.length;
  const remainingMessage = remainingCount > 0 ? ` and ${remainingCount} more` : "";
  const completionMessage = noChangesApplied ? " No changes were applied." : "";

  throw new BadRequestError({
    message: `GitHub team sync cannot safely reconcile ${unlinkedUserIds.length} existing group member${unlinkedUserIds.length === 1 ? "" : "s"} without a verified GitHub sign-in (${listedMembers.join(", ")}${remainingMessage}). Ask them to sign in with GitHub, or remove them from the corresponding Infisical groups, then run the sync again.${completionMessage}`
  });
};

type TGithubOrgSyncServiceFactoryDep = {
  githubOrgSyncDAL: TGithubOrgSyncDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "find" | "findGroupMembershipsByUserIdInOrg" | "findGroupMembershipsByGroupIdInOrg" | "insertMany" | "delete"
  >;
  groupDAL: Pick<TGroupDALFactory, "insertMany" | "transaction" | "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "insertMany">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "findOrgMembershipById" | "findOrgMembershipsWithUsersByOrgId">;
  userAliasDAL: Pick<TUserAliasDALFactory, "find">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "pruneOutOfScopeRecipients">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
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
  userAliasDAL,
  membershipRoleDAL,
  membershipGroupDAL,
  usageMeteringService,
  alertChannelRecipientDAL,
  auditLogService
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

  const syncUserGroups = async ({
    orgId,
    userId,
    username: infisicalUsername,
    accessToken,
    auditLogInfo
  }: TSyncUserGroupsDTO) => {
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
    const githubUserTeamsByName = mapGithubTeamsByName(teams?.edges?.map((el) => el.node) ?? []);
    const githubUserTeams = [...githubUserTeamsByName.keys()];
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
        const newGroups = await groupDAL.transaction(async (tx) => {
          const insertedGroups = await groupDAL.insertMany(
            newTeams.map((newGroupName) => ({
              name: newGroupName,
              slug: newGroupName,
              orgId
            })),
            tx
          );
          const memberships = await membershipGroupDAL.insertMany(
            insertedGroups.map((el) => ({
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
            insertedGroups.map((el) => ({
              groupId: el.id,
              userId
            })),
            tx
          );

          return insertedGroups;
        });

        await createGithubOrgSyncAuditLogs({
          auditLogService,
          auditLogInfo,
          orgId,
          githubOrgName: config.githubOrgName,
          syncTrigger: "login",
          changes: newGroups.map((group) => ({
            action: "add",
            groupId: group.id,
            groupName: group.name,
            userId,
            username: infisicalUsername
          }))
        });
      }

      if (updateTeams.length) {
        const groupsToUpdate = updateTeams.map((teamName) => githubUserTeamOnInfisicalGroupByName[teamName][0]);
        await groupDAL.transaction(async (tx) => {
          await userGroupMembershipDAL.insertMany(
            groupsToUpdate.map((group) => ({
              groupId: group.id,
              userId
            })),
            tx
          );
        });

        await createGithubOrgSyncAuditLogs({
          auditLogService,
          auditLogInfo,
          orgId,
          githubOrgName: config.githubOrgName,
          syncTrigger: "login",
          changes: groupsToUpdate.map((group) => ({
            action: "add",
            groupId: group.id,
            groupName: group.name,
            userId,
            username: infisicalUsername
          }))
        });
      }

      if (removeFromTeams.length) {
        await groupDAL.transaction(async (tx) => {
          await userGroupMembershipDAL.delete(
            { userId, $in: { groupId: removeFromTeams.map((el) => el.groupId) } },
            tx
          );

          await alertChannelRecipientDAL.pruneOutOfScopeRecipients({ userIds: [userId] }, tx);
        });

        await createGithubOrgSyncAuditLogs({
          auditLogService,
          auditLogInfo,
          orgId,
          githubOrgName: config.githubOrgName,
          syncTrigger: "login",
          changes: removeFromTeams.map((group) => ({
            action: "remove",
            groupId: group.groupId,
            groupName: group.groupName,
            userId,
            username: infisicalUsername
          }))
        });
      }

      // Group membership changes cascade into the group-expanded project identity meters.
      usageMeteringService.emit(orgId, SecretIdentities.key);
      usageMeteringService.emit(orgId, PamIdentities.key);
      usageMeteringService.emit(orgId, AgentVaultIdentities.key);
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
            message: githubTeamAccessDeniedMessage(config.githubOrgName)
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

  const syncAllTeams = async ({ orgPermission, auditLogInfo }: TSyncAllTeamsDTO): Promise<TSyncResult> => {
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

    const activeMembersById = new Map(activeMembers.map((member) => [member.id, member]));
    const activeUserIds = new Set(activeMembers.flatMap((member) => (member.user ? [member.user.id] : [])));
    const githubAliases = activeUserIds.size
      ? await userAliasDAL.find({
          aliasType: UserAliasType.GITHUB,
          isEmailVerified: true,
          $in: { userId: [...activeUserIds] }
        })
      : [];
    const matchGithubMember = buildGithubMemberMatcher(githubAliases, activeUserIds);
    const linkedActiveUserIds = new Set(githubAliases.map((alias) => alias.userId));
    const activeUsers = activeMembers.flatMap((member) => (member.user ? [member.user] : []));
    const activeUsersById = new Map(activeUsers.map((user) => [user.id, user]));

    const startTime = Date.now();
    const syncErrors: string[] = [];
    const unmatchedGithubUsers = new Set<string>();

    const octokit = new Octokit({ auth: orgAccessToken });

    const githubTeams = await fetchGithubOrgTeams(octokit, config.githubOrgName).catch((err) => {
      if (err instanceof BadRequestError) throw err;
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
            message: githubTeamAccessDeniedMessage(config.githubOrgName)
          });
        }
        if (statusCode === 404) {
          throw new BadRequestError({
            message: `Organization ${config.githubOrgName} not found or access token does not have sufficient permissions to read it.`
          });
        }
        if (statusCode >= 500) {
          throw new BadRequestError({
            message: `GitHub did not respond in time while listing teams for organization ${config.githubOrgName}. Please try again later.`
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

    const githubTeamsByName = mapGithubTeamsByName(githubTeams);
    const githubTeamMembersByName = new Map([...githubTeamsByName].map(([teamName, team]) => [teamName, team.members]));

    const allGithubTeamNames = Array.from(githubTeamMembersByName.keys());

    const existingTeamsOnInfisical = await groupDAL.find({
      orgId: orgPermission.orgId,
      $in: { name: allGithubTeamNames }
    });
    const existingTeamsMap = groupBy(existingTeamsOnInfisical, (i) => i.name);

    if (existingTeamsOnInfisical.length) {
      const existingGroupMemberships = await userGroupMembershipDAL.find({
        $in: { groupId: existingTeamsOnInfisical.map((team) => team.id) }
      });
      assertGithubGroupMembersLinked({
        currentUserIds: new Set(
          existingGroupMemberships.map((membership) => membership.userId).filter((userId) => activeUserIds.has(userId))
        ),
        linkedUserIds: linkedActiveUserIds,
        activeUsers,
        noChangesApplied: true
      });
    }

    const teamsToCreate = allGithubTeamNames.filter((teamName) => !(teamName in existingTeamsMap));
    const createdTeams = new Set<string>();
    const updatedTeams = new Set<string>();
    let totalRemovedMemberships = 0;

    if (teamsToCreate.length > 0) {
      await groupDAL.transaction(async (tx) => {
        const newGroups = await groupDAL.insertMany(
          teamsToCreate.map((teamName) => ({
            name: teamName,
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
      });
    }

    const allTeams = [...Object.values(existingTeamsMap).flat()];

    for (const team of allTeams) {
      const teamName = team.name.toLowerCase();
      const expectedUserIds = new Set<string>();
      (githubTeamMembersByName.get(teamName) ?? []).forEach((githubMember) => {
        const userId = matchGithubMember(githubMember);

        if (userId) {
          expectedUserIds.add(userId);
          logger.info(
            { githubLogin: githubMember.login, githubUserId: githubMember.databaseId, userId },
            "Matched GitHub team member through a verified GitHub login"
          );
        } else {
          unmatchedGithubUsers.add(githubMember.login);
        }
      });

      const resolveMembershipChanges = (currentMemberships: GroupMembership[]) => {
        const currentUserIds = new Set<string>();
        currentMemberships.forEach((membership) => {
          const activeMember = activeMembersById.get(membership.orgMembershipId);
          if (activeMember?.user?.id) {
            currentUserIds.add(activeMember.user.id);
          }
        });
        assertGithubGroupMembersLinked({
          currentUserIds,
          linkedUserIds: linkedActiveUserIds,
          activeUsers
        });

        return {
          usersToAdd: Array.from(expectedUserIds).filter((userId) => !currentUserIds.has(userId)),
          membershipsToRemove: currentMemberships.filter((membership) => {
            const userId = activeMembersById.get(membership.orgMembershipId)?.user?.id;
            return Boolean(userId && !expectedUserIds.has(userId));
          })
        };
      };

      const currentMemberships = (await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(
        team.id,
        orgPermission.orgId
      )) as GroupMembership[];
      const pendingChanges = resolveMembershipChanges(currentMemberships);
      if (pendingChanges.usersToAdd.length || pendingChanges.membershipsToRemove.length) {
        const membershipChanges = await groupDAL.transaction(async (tx) => {
          const latestMemberships = (await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(
            team.id,
            orgPermission.orgId,
            tx
          )) as GroupMembership[];
          const { usersToAdd, membershipsToRemove } = resolveMembershipChanges(latestMemberships);

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

            const removedUserIds = membershipsToRemove
              .map((membership) => activeMembersById.get(membership.orgMembershipId)?.user?.id)
              .filter(Boolean) as string[];
            await alertChannelRecipientDAL.pruneOutOfScopeRecipients({ userIds: removedUserIds }, tx);

            updatedTeams.add(teamName);
          }

          return {
            usersToAdd,
            removedUserIds: membershipsToRemove
              .map((membership) => activeMembersById.get(membership.orgMembershipId)?.user?.id)
              .filter(Boolean) as string[],
            removedMembershipCount: membershipsToRemove.length
          };
        });
        totalRemovedMemberships += membershipChanges.removedMembershipCount;

        await createGithubOrgSyncAuditLogs({
          auditLogService,
          auditLogInfo,
          orgId: orgPermission.orgId,
          githubOrgName: config.githubOrgName,
          syncTrigger: "manual",
          changes: [
            ...membershipChanges.usersToAdd.flatMap((userId) => {
              const user = activeUsersById.get(userId);
              return user
                ? [
                    {
                      action: "add" as const,
                      groupId: team.id,
                      groupName: team.name,
                      userId,
                      username: user.username ?? user.email
                    }
                  ]
                : [];
            }),
            ...membershipChanges.removedUserIds.flatMap((userId) => {
              const user = activeUsersById.get(userId);
              return user
                ? [
                    {
                      action: "remove" as const,
                      groupId: team.id,
                      groupName: team.name,
                      userId,
                      username: user.username ?? user.email
                    }
                  ]
                : [];
            })
          ]
        });
      }
    }

    if (createdTeams.size || updatedTeams.size) {
      // Team membership changes cascade into the group-expanded project identity meters.
      usageMeteringService.emit(orgPermission.orgId, SecretIdentities.key);
      usageMeteringService.emit(orgPermission.orgId, PamIdentities.key);
      usageMeteringService.emit(orgPermission.orgId, AgentVaultIdentities.key);
    }

    if (unmatchedGithubUsers.size) {
      const unmatchedLogins = [...unmatchedGithubUsers].sort();
      const reportLimit = 10;
      const listedLogins = unmatchedLogins.slice(0, reportLimit);
      const remainingCount = unmatchedLogins.length - listedLogins.length;
      const remainingMessage = remainingCount > 0 ? ` and ${remainingCount} more` : "";
      syncErrors.push(
        `Skipped ${unmatchedLogins.length} GitHub team member${unmatchedLogins.length === 1 ? "" : "s"} without a verified Infisical GitHub link (${listedLogins.join(", ")}${remainingMessage}). Ask them to sign in with GitHub, then run the sync again.`
      );
      logger.info(
        { orgId: orgPermission.orgId, count: unmatchedGithubUsers.size },
        "GitHub org sync skipped team members without a verified GitHub login"
      );
    }

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
