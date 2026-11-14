import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import {
  AccessScope,
  RESOURCE_SCOPE,
  ResourceType,
  TAgentVaultServiceCustomHeaders,
  TAgentVaultServices,
  TAgentVaultServiceSubstitutions,
  TAgentVaultServiceVariableReferencesInsert,
  TMemberships
} from "@app/db/schemas";
import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { hasPostgresConstraintViolation, hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { shake } from "@app/lib/fn";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import {
  findCallerDelegation,
  resolveOnBehalfOfUser,
  TOnBehalfOfDeps
} from "../agent-vault-delegation/agent-vault-on-behalf-of-fns";
import { TAgentVaultMemberDALFactory } from "../agent-vault-member/agent-vault-member-dal";
import {
  checkOauthClaimUnderLock,
  checkOauthServerUnderLock,
  OAUTH_SERVER_URL_NEEDS_AUTHORIZATION_MESSAGE,
  TAgentVaultOauthServiceFactory
} from "../agent-vault-oauth/agent-vault-oauth-service";
import {
  hashAccessToken,
  isMemberProvidedOauth,
  memberOauthSetupOf,
  oauthConnectionStatusOf
} from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import {
  AGENT_VAULT_OAUTH_HEADER_NAME,
  AGENT_VAULT_OAUTH_HEADER_PREFIX,
  AgentVaultOauthRegistration,
  TAgentVaultOauthConfig,
  TAgentVaultOauthMemberConfig
} from "../agent-vault-oauth/agent-vault-oauth-types";
import { TAgentVaultPersonalValueDALFactory } from "../agent-vault-personal-value/agent-vault-personal-value-dal";
import {
  clearPersonalValuesAfterRevoke,
  sameMemberProvidedFields
} from "../agent-vault-personal-value/agent-vault-personal-value-fns";
import { TAgentVaultPersonalValueServiceFactory } from "../agent-vault-personal-value/agent-vault-personal-value-service";
import { TAgentVaultVariableDALFactory } from "../agent-vault-variable/agent-vault-variable-dal";
import {
  agentVaultActorKey,
  resolveAgentVaultActorNames,
  TAgentVaultActorName,
  TAgentVaultActorNameDALs
} from "../agent-vault/agent-vault-actor-name-fns";
import { describeConflict, findHostPatternConflicts } from "../agent-vault/agent-vault-conflict-fns";
import { TAgentVaultCredentialConfig } from "../agent-vault/agent-vault-credential-schemas";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import {
  AgentVaultCredentialType,
  AgentVaultMemberType,
  AgentVaultOauthStatus,
  AgentVaultResourceRole,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "../agent-vault/agent-vault-enums";
import {
  AGENT_VAULT_HOOK_CHANGED_DURING_SAVE_MESSAGE,
  assertAgentVaultHooksOnPlan,
  classifyHookUpdate,
  describeHookChange
} from "../agent-vault/agent-vault-hook-fns";
import {
  describeNativeTlsCaChange,
  isNativeServiceType,
  toNativeTlsConfigInput
} from "../agent-vault/agent-vault-native-config-schemas";
import { ownerOrNullOf } from "../agent-vault/agent-vault-owner-fns";
import {
  getAgentVaultGrantedReachability,
  getAgentVaultReachability,
  intersectAccessBundleIds,
  serviceIdsReachedThrough,
  TAgentVaultPermission
} from "../agent-vault/agent-vault-permission";
import {
  assertCredentialTypeSupported,
  assertServiceFieldsSupported,
  buildServiceConfig,
  dropReadBackServiceFields,
  getAgentVaultServiceType,
  getServiceServerUrl,
  isCredentialOfType,
  resolveServiceHostPattern,
  TAgentVaultServiceConfig,
  toServiceTypeFields
} from "../agent-vault/agent-vault-service-type-fns";
import {
  AGENT_VAULT_SSH_KEY_VARIABLE_MESSAGE,
  expandStoredVariableReferences,
  findStoredVariableIds,
  findVariableKeys,
  hasVariableReference,
  toStoredVariableReferences,
  toVariableReference
} from "../agent-vault/agent-vault-variable-fns";
import {
  TAgentVaultAccessBundleActorRef,
  TAgentVaultAccessBundleDALFactory,
  TAgentVaultAccessBundleListRow
} from "./agent-vault-access-bundle-dal";
import {
  TAddMembersDTO,
  TAddBundleServicesDTO,
  TBundleServiceDTO,
  TAgentVaultBasicMemberField,
  TAgentVaultBearerMemberField,
  TAgentVaultCredentialSummary,
  TAgentVaultCredentialUpdate,
  TAgentVaultCustomHeaderUpdate,
  TAgentVaultServiceSummary,
  TAgentVaultVariableReferenceSummary,
  TCreateAccessBundleDTO,
  TCreateServiceDTO,
  TDeleteAccessBundleDTO,
  TDeleteServiceDTO,
  TGetAccessBundleDTO,
  TListAccessBundlesDTO,
  TListMcpToolsDTO,
  TListServicesDTO,
  TListMembersDTO,
  TRevokeMembersDTO,
  TServiceByIdDTO,
  TUpdateAccessBundleDTO,
  TUpdateServiceDTO
} from "./agent-vault-access-bundle-types";
import {
  assertNativeBasicHasUsername,
  isStoredSecretReplaced,
  memberFieldsOf,
  memberOauthChangeOf,
  mergeCredential,
  needsStoredSecretFor,
  nextMemberFieldsOf,
  personalValuesToClearOf,
  splitCredential,
  storedHasCertificate,
  TCredentialWrite
} from "./agent-vault-credential-write-fns";
import { listMcpServerTools, McpListError } from "./agent-vault-mcp-tool-list-fns";
import { TAgentVaultServiceCustomHeaderDALFactory } from "./agent-vault-service-custom-header-dal";
import { TAgentVaultCatalogService, TAgentVaultServiceDALFactory } from "./agent-vault-service-dal";
import { TAgentVaultServiceSubstitutionDALFactory } from "./agent-vault-service-substitution-dal";
import {
  TAgentVaultServiceVariableReferenceDALFactory,
  TAgentVaultVariableReferenceWithKey
} from "./agent-vault-service-variable-reference-dal";
import {
  assertCustomHeadersDoNotShadowCredential,
  matchTransformationRows,
  planTransformationDiff,
  TTransformationWrite
} from "./agent-vault-transformation-fns";

type TAgentVaultAccessBundleServiceFactoryDep = {
  agentVaultAccessBundleDAL: TAgentVaultAccessBundleDALFactory;
  agentVaultServiceDAL: TAgentVaultServiceDALFactory;
  agentVaultServiceCustomHeaderDAL: TAgentVaultServiceCustomHeaderDALFactory;
  agentVaultServiceSubstitutionDAL: TAgentVaultServiceSubstitutionDALFactory;
  agentVaultVariableDAL: Pick<TAgentVaultVariableDALFactory, "findKeys" | "lockForReference" | "findValuesForResolve">;
  agentVaultServiceVariableReferenceDAL: TAgentVaultServiceVariableReferenceDALFactory;
  agentVaultPersonalValueDAL: Pick<
    TAgentVaultPersonalValueDALFactory,
    "delete" | "deleteForServiceExceptFields" | "deleteForActorsWithoutGrant"
  >;
  agentVaultPersonalValueService: Pick<TAgentVaultPersonalValueServiceFactory, "findStatusesForOwner">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseService, "getPlan">;
  membershipDAL: Pick<
    TMembershipDALFactory,
    "findOne" | "find" | "insertMany" | "delete" | "deleteById" | "transaction" | "findResourceMembershipsForActor"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany">;
  agentVaultMemberDAL: Pick<TAgentVaultMemberDALFactory, "findProductMembers">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
  agentVaultDelegationDAL: TOnBehalfOfDeps["agentVaultDelegationDAL"];
  orgDAL: TOnBehalfOfDeps["orgDAL"];
  userDAL: TOnBehalfOfDeps["userDAL"];
  agentVaultOauthService: Pick<
    TAgentVaultOauthServiceFactory,
    | "claimAuthorization"
    | "buildCredentialFromAuthorization"
    | "readAuthorizationAccessToken"
    | "refreshServiceToken"
    | "prepareMemberOauth"
  >;
} & TAgentVaultActorNameDALs;

export type TAgentVaultAccessBundleServiceFactory = ReturnType<typeof agentVaultAccessBundleServiceFactory>;

export const OAUTH_NEEDS_AUTHORIZATION_OR_MEMBERS_MESSAGE =
  "An OAuth credential needs a completed authorization, or memberProvidedFields ['credential-value'] to leave the sign-in to each member.";

// The old shape capped the array at 100 entries; the cap moves here now that the body is three lists.
export const AGENT_VAULT_MAX_GRANTEES = 100;

const ALL_GRANTEE_ACTOR_TYPES = [
  AgentVaultMemberType.User,
  AgentVaultMemberType.Group,
  AgentVaultMemberType.MachineIdentity
];

export const agentVaultAccessBundleServiceFactory = (deps: TAgentVaultAccessBundleServiceFactoryDep) => {
  const {
    agentVaultAccessBundleDAL,
    agentVaultServiceDAL,
    agentVaultServiceCustomHeaderDAL,
    agentVaultServiceSubstitutionDAL,
    agentVaultVariableDAL,
    agentVaultServiceVariableReferenceDAL,
    agentVaultPersonalValueDAL,
    agentVaultPersonalValueService,
    permissionService,
    kmsService,
    licenseService,
    membershipDAL,
    membershipRoleDAL,
    agentVaultMemberDAL,
    userGroupMembershipDAL,
    identityGroupMembershipDAL,
    agentVaultOauthService,
    userDAL,
    groupDAL,
    identityDAL,
    agentVaultDelegationDAL,
    orgDAL
  } = deps;

  const bundleScope = (projectId: string, accessBundleId: string) => ({
    scope: RESOURCE_SCOPE as typeof RESOURCE_SCOPE,
    scopeProjectId: projectId,
    scopeResourceType: ResourceType.AgentVaultAccessBundle,
    scopeResourceId: accessBundleId
  });

  const toActorRef = (row: TMemberships): TAgentVaultAccessBundleActorRef => {
    if (row.actorIdentityId) return { type: AgentVaultMemberType.MachineIdentity, id: row.actorIdentityId };
    if (row.actorGroupId) return { type: AgentVaultMemberType.Group, id: row.actorGroupId };
    return { type: AgentVaultMemberType.User, id: row.actorUserId ?? "" };
  };

  const toMember = (row: TMemberships) => ({
    ...toActorRef(row),
    grantedAt: row.createdAt
  });

  // actorName is for the audit body; the response schemas do not select it.
  const withActorNames = <T extends TAgentVaultAccessBundleActorRef>(
    members: T[],
    nameByKey: Map<string, TAgentVaultActorName>
  ) => members.map((member) => ({ ...member, actorName: nameByKey.get(agentVaultActorKey(member)) }));

  type TGrantActorColumn = "actorUserId" | "actorIdentityId" | "actorGroupId";

  type TGrantActor = { actorColumn: TGrantActorColumn; actorId: string };

  const actorKey = ({ actorColumn, actorId }: TGrantActor) => `${actorColumn}:${actorId}`;

  const ACTOR_TYPE_OF: Record<TGrantActorColumn, AgentVaultMemberType> = {
    actorUserId: AgentVaultMemberType.User,
    actorIdentityId: AgentVaultMemberType.MachineIdentity,
    actorGroupId: AgentVaultMemberType.Group
  };

  const toActorRefFromGrant = ({ actorColumn, actorId }: TGrantActor): TAgentVaultAccessBundleActorRef => ({
    type: ACTOR_TYPE_OF[actorColumn],
    id: actorId
  });

  // Called before the write: a lookup that failed after commit would fail the request with the change made,
  // and the retry finds the actor skipped, so that change would never be audited.
  const resolveActorNames = (actors: TGrantActor[]) =>
    resolveAgentVaultActorNames({ userDAL, groupDAL, identityDAL }, actors.map(toActorRefFromGrant));

  const ACTOR_FIELD_OF: Record<TGrantActorColumn, "userId" | "identityId" | "groupId"> = {
    actorUserId: "userId",
    actorIdentityId: "identityId",
    actorGroupId: "groupId"
  };

  const writeGrants = async (
    {
      projectId,
      orgId,
      accessBundleId,
      actors
    }: { projectId: string; orgId: string; accessBundleId: string; actors: TGrantActor[] },
    tx: Knex
  ) => {
    const memberships = await membershipDAL.insertMany(
      actors.map(({ actorColumn, actorId }) => ({
        ...bundleScope(projectId, accessBundleId),
        scopeOrgId: orgId,
        [actorColumn]: actorId,
        isActive: true
      })),
      tx
    );
    await membershipRoleDAL.insertMany(
      memberships.map((membership) => ({ membershipId: membership.id, role: AgentVaultResourceRole.Consumer })),
      tx
    );
    return memberships;
  };

  const isInProjectThroughGroup = async ({
    projectId,
    userId,
    identityId
  }: {
    projectId: string;
    userId?: string;
    identityId?: string;
  }) => {
    const groups = userId
      ? await userGroupMembershipDAL.find({ userId })
      : await identityGroupMembershipDAL.find({ identityId: identityId! });
    if (!groups.length) return false;

    const viaGroup = await membershipDAL.find({
      scope: AccessScope.Project,
      scopeProjectId: projectId,
      $in: { actorGroupId: groups.map((group) => group.groupId) }
    });
    return viaGroup.length > 0;
  };

  const assertActorInProject = async ({
    projectId,
    userId,
    identityId,
    groupId
  }: {
    projectId: string;
    userId?: string;
    identityId?: string;
    groupId?: string;
  }) => {
    const membership = await membershipDAL.findOne({
      scope: AccessScope.Project,
      scopeProjectId: projectId,
      ...(userId ? { actorUserId: userId } : {}),
      ...(identityId ? { actorIdentityId: identityId } : {}),
      ...(groupId ? { actorGroupId: groupId } : {})
    });

    if (membership) return;

    // Named, because a batch grant rejects on the first offender and the caller would otherwise have to bisect.
    let actor = `group '${groupId}'`;
    if (userId) actor = `user '${userId}'`;
    else if (identityId) actor = `machine identity '${identityId}'`;

    if (!groupId && (await isInProjectThroughGroup({ projectId, userId, identityId }))) {
      throw new BadRequestError({
        message: `The ${actor} is in this Agent Vault project through a group. Grant the access bundle to the group, or add them directly under Access Control first.`
      });
    }

    throw new BadRequestError({
      message: `The ${actor} is not a member of this Agent Vault project. Add them under Access Control first.`
    });
  };

  const assertActorsInProject = async ({ projectId, actors }: { projectId: string; actors: TGrantActor[] }) => {
    const idsByColumn = new Map<TGrantActorColumn, string[]>();
    actors.forEach((actor) => {
      idsByColumn.set(actor.actorColumn, [...(idsByColumn.get(actor.actorColumn) ?? []), actor.actorId]);
    });

    const found = new Set<string>();
    await Promise.all(
      [...idsByColumn].map(async ([actorColumn, actorIds]) => {
        const rows = await membershipDAL.find({
          scope: AccessScope.Project,
          scopeProjectId: projectId,
          $in: { [actorColumn]: actorIds }
        });
        rows.forEach((row) => found.add(actorKey({ actorColumn, actorId: row[actorColumn]! })));
      })
    );

    // The single-actor check re-queries the first offender so the caller gets the specific reason, not just a count.
    const missing = actors.find((actor) => !found.has(actorKey(actor)));
    if (missing) {
      await assertActorInProject({ projectId, [ACTOR_FIELD_OF[missing.actorColumn]]: missing.actorId });
    }
  };

  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const summarizeCredential = (service: TAgentVaultServices): TAgentVaultCredentialSummary => {
    const config = service.credentialConfig as Record<string, string>;
    const memberProvidedFields = service.memberProvidedFields ?? [];
    switch (service.credentialType as AgentVaultCredentialType) {
      // Nothing secret and nothing that identifies the token. The member-provided summary includes the client ID, so the
      // UI can show which admin-entered client is kept.
      case AgentVaultCredentialType.OAuth: {
        if (isMemberProvidedOauth(service)) {
          const memberOauth = service.credentialConfig as TAgentVaultOauthMemberConfig;
          return {
            type: AgentVaultCredentialType.OAuth,
            memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue],
            issuer: memberOauth.issuer,
            grantedScopes: [],
            requiredScopes: [],
            registration: memberOauth.registration,
            clientId: memberOauth.clientId
          };
        }
        return {
          type: AgentVaultCredentialType.OAuth,
          memberProvidedFields: [],
          ...oauthConnectionStatusOf(service.credentialConfig as TAgentVaultOauthConfig)
        };
      }
      case AgentVaultCredentialType.Bearer:
        return {
          type: AgentVaultCredentialType.Bearer,
          headerName: config.headerName,
          headerPrefix: config.headerPrefix,
          memberProvidedFields: memberProvidedFields as TAgentVaultBearerMemberField[]
        };
      case AgentVaultCredentialType.Basic:
        return {
          type: AgentVaultCredentialType.Basic,
          memberProvidedFields: memberProvidedFields as TAgentVaultBasicMemberField[]
        };
      case AgentVaultCredentialType.SshKey:
        return {
          type: AgentVaultCredentialType.SshKey,
          hasCertificate: Boolean((service.credentialConfig as { hasCertificate?: boolean }).hasCertificate)
        };
      default:
        return { type: AgentVaultCredentialType.Passthrough };
    }
  };

  const summarizeVariableReference = (
    reference: TAgentVaultVariableReferenceWithKey
  ): TAgentVaultVariableReferenceSummary => {
    const base = { variableId: reference.variableId, key: reference.key };
    // The field check constraint guarantees the id that matches the field is set.
    switch (reference.field as AgentVaultVariableReferenceField) {
      case AgentVaultVariableReferenceField.CustomHeader:
        return {
          ...base,
          field: AgentVaultVariableReferenceField.CustomHeader,
          customHeaderId: reference.customHeaderId!
        };
      case AgentVaultVariableReferenceField.Substitution:
        return {
          ...base,
          field: AgentVaultVariableReferenceField.Substitution,
          substitutionId: reference.substitutionId!
        };
      case AgentVaultVariableReferenceField.CredentialUsername:
        return { ...base, field: AgentVaultVariableReferenceField.CredentialUsername };
      default:
        return { ...base, field: AgentVaultVariableReferenceField.CredentialValue };
    }
  };

  // A type's create and update refuse the fields it can't use, so it never stores another kind of reference. This
  // only narrows the list to the kinds the type's response lists.
  const isReferenceOfField =
    <TField extends AgentVaultVariableReferenceField>(fields: readonly TField[]) =>
    (
      reference: TAgentVaultVariableReferenceSummary
    ): reference is Extract<TAgentVaultVariableReferenceSummary, { field: TField }> =>
      (fields as readonly AgentVaultVariableReferenceField[]).includes(reference.field);
  const isCredentialReference = isReferenceOfField([
    AgentVaultVariableReferenceField.CredentialValue,
    AgentVaultVariableReferenceField.CredentialUsername
  ]);

  // Built by hand rather than spread, so the sealed columns stay off the wire even if the response schema is
  // later loosened.
  const projectService = (
    service: TAgentVaultCatalogService,
    customHeaders: TAgentVaultServiceCustomHeaders[],
    substitutions: TAgentVaultServiceSubstitutions[],
    variableReferences: TAgentVaultVariableReferenceWithKey[]
  ): TAgentVaultServiceSummary => {
    const base = {
      id: service.id,
      name: service.name,
      description: service.description ?? null,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      hook: service.hookUrl ? { url: service.hookUrl } : null
    };
    const references = variableReferences.map(summarizeVariableReference);
    const credential = summarizeCredential(service);
    const customHeaderSummaries = customHeaders.map((header) => ({
      id: header.id,
      name: header.name,
      prefix: header.prefix
    }));
    // Every create and update checks the credential against the type, so this means a row written some other way.
    const unsupportedCredential = () =>
      new InternalServerError({
        message: `The service '${service.name}' has a credential its type doesn't support. Set its credential again.`
      });
    // Only the fields of the service's own type. A client that sends back what it read still gets through an
    // update, which drops the read-only fields it echoes.
    const typeFields = toServiceTypeFields(service);
    switch (typeFields.type) {
      case AgentVaultServiceType.Http:
        if (
          !isCredentialOfType(credential, [
            AgentVaultCredentialType.Bearer,
            AgentVaultCredentialType.Basic,
            AgentVaultCredentialType.Passthrough
          ])
        ) {
          throw unsupportedCredential();
        }
        return {
          ...base,
          ...typeFields,
          variableReferences: references,
          credential,
          customHeaders: customHeaderSummaries,
          substitutions: substitutions.map((substitution) => ({
            id: substitution.id,
            placeholder: substitution.placeholder,
            surfaces: substitution.surfaces as AgentVaultSubstitutionSurface[]
          }))
        };
      case AgentVaultServiceType.Mcp:
        if (!isCredentialOfType(credential, [AgentVaultCredentialType.Bearer, AgentVaultCredentialType.OAuth])) {
          throw unsupportedCredential();
        }
        return {
          ...base,
          ...typeFields,
          variableReferences: references.filter(
            isReferenceOfField([
              AgentVaultVariableReferenceField.CredentialValue,
              AgentVaultVariableReferenceField.CredentialUsername,
              AgentVaultVariableReferenceField.CustomHeader
            ])
          ),
          credential,
          customHeaders: customHeaderSummaries
        };
      case AgentVaultServiceType.Ssh:
        if (!isCredentialOfType(credential, [AgentVaultCredentialType.Basic, AgentVaultCredentialType.SshKey])) {
          throw unsupportedCredential();
        }
        return { ...base, ...typeFields, variableReferences: references.filter(isCredentialReference), credential };
      default:
        if (!isCredentialOfType(credential, [AgentVaultCredentialType.Basic])) throw unsupportedCredential();
        return { ...base, ...typeFields, variableReferences: references.filter(isCredentialReference), credential };
    }
  };

  const serviceVisibilityOf = (permission: TAgentVaultPermission["permission"]) => ({
    canReadVariables: permission.can(
      ProjectPermissionAgentVaultVariableActions.Read,
      ProjectPermissionSub.AgentVaultVariables
    ),
    canSeeSetup: permission.can(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    )
  });

  // A service as the caller may see it. Without Read on variables, variableReferences is left out: an empty list would
  // claim the service uses none. The OAuth sign-in state is the account of whoever set up the service, and the hook is
  // part of that setup, so only those who can edit services get them.
  const viewService = (
    service: TAgentVaultCatalogService,
    transformations: Awaited<ReturnType<typeof loadTransformations>>,
    {
      canReadVariables,
      canSeeSetup,
      status
    }: {
      canReadVariables: boolean;
      canSeeSetup: boolean;
      status?: Awaited<ReturnType<TAgentVaultPersonalValueServiceFactory["findStatusesForOwner"]>>[number];
    }
  ) => {
    const projected = projectService(
      service,
      transformations.customHeaders.filter((header) => header.serviceId === service.id),
      transformations.substitutions.filter((substitution) => substitution.serviceId === service.id),
      transformations.variableReferences.filter((reference) => reference.serviceId === service.id)
    );
    const { credential } = projected;
    return {
      ...projected,
      ...(canReadVariables ? {} : { variableReferences: undefined }),
      ...(canSeeSetup
        ? {}
        : {
            hook: undefined,
            ...(credential.type === AgentVaultCredentialType.OAuth
              ? { credential: { ...credential, expiresAt: undefined, authorizedAt: undefined, lastError: undefined } }
              : {})
          }),
      // The caller's own values, null when the admin sets the whole credential.
      personalValues: status ? { isConfigured: status.isConfigured, fields: status.fields } : null
    };
  };

  const loadTransformations = async (
    serviceIds: string[],
    tx?: Knex,
    { withVariableReferences = true }: { withVariableReferences?: boolean } = {}
  ) => {
    const [customHeaders, substitutions, variableReferences] = await Promise.all([
      agentVaultServiceCustomHeaderDAL.findByServiceIds(serviceIds, tx),
      agentVaultServiceSubstitutionDAL.findByServiceIds(serviceIds, tx),
      withVariableReferences ? agentVaultServiceVariableReferenceDAL.findByServiceIds(serviceIds, tx) : []
    ]);
    return { customHeaders, substitutions, variableReferences };
  };

  // What a missing key's error calls the field. Never the value itself, which is secret.
  type TReferencingText = { label: string; text: string };

  type TReferenceTarget = {
    field: AgentVaultVariableReferenceField;
    customHeaderId?: string;
    substitutionId?: string;
  };

  const credentialReferenceTexts = (credential: TAgentVaultCredentialUpdate): TReferencingText[] => {
    switch (credential.type) {
      case AgentVaultCredentialType.Bearer:
        return credential.value === undefined ? [] : [{ label: "The token", text: credential.value }];
      case AgentVaultCredentialType.Basic:
        return [
          ...(credential.username === undefined ? [] : [{ label: "The username", text: credential.username }]),
          ...(credential.password === undefined ? [] : [{ label: "The password", text: credential.password }])
        ];
      // A key spans lines, which a variable's value can't, so none of the three parts takes a reference yet.
      case AgentVaultCredentialType.SshKey:
        if (
          [credential.username, credential.privateKey, credential.certificate].some(
            (text) => text && hasVariableReference(text)
          )
        ) {
          throw new BadRequestError({ message: AGENT_VAULT_SSH_KEY_VARIABLE_MESSAGE });
        }
        return [];
      default:
        return [];
    }
  };

  // A key Agent Vault does not define would reach the host as literal braces, so it fails the save instead.
  // Stored text that a save keeps rather than writes needs the lookup only for the ids it holds.
  const loadProjectVariables = async (projectId: string, texts: TReferencingText[], storedTexts: string[] = []) => {
    if (
      !texts.some(({ text }) => findVariableKeys(text).length) &&
      !storedTexts.some((text) => findStoredVariableIds(text).length)
    ) {
      return { idOfKey: new Map<string, string>(), variableIds: new Set<string>() };
    }

    const variables = await agentVaultVariableDAL.findKeys({ projectId, owner: null });
    const idOfKey = new Map(variables.map((variable) => [variable.key, variable.id]));

    texts.forEach(({ label, text }) => {
      const missing = findVariableKeys(text).find((key) => !idOfKey.has(key));
      if (missing) {
        throw new BadRequestError({
          message: `${label} uses ${toVariableReference(missing)}, but there's no global variable named '${missing}'. Add it under Variables, or correct the name.`
        });
      }
    });

    return { idOfKey, variableIds: new Set(variables.map((variable) => variable.id)) };
  };

  // Only text that arrived with the request is stored. A basic credential's kept half is already stored text,
  // and one saved before variables existed has to keep reaching the host exactly as it was.
  const storeCredentialReferences = (
    credential: TAgentVaultCredentialUpdate,
    store: (text: string) => string
  ): TAgentVaultCredentialUpdate => {
    switch (credential.type) {
      case AgentVaultCredentialType.Bearer:
        return credential.value === undefined ? credential : { ...credential, value: store(credential.value) };
      case AgentVaultCredentialType.Basic:
        return {
          ...credential,
          ...(credential.username === undefined ? {} : { username: store(credential.username) }),
          ...(credential.password === undefined ? {} : { password: store(credential.password) })
        };
      default:
        return credential;
    }
  };

  // Read off the stored text the way resolve reads it, never off the request. Nothing in the database can check
  // the rows against sealed text, and an id resolve expands without a row is a variable the delete refusal lets
  // go while a service still uses it.
  const referenceRowsOf = (
    serviceId: string,
    target: TReferenceTarget,
    storedText: string,
    variableIds: ReadonlySet<string>
  ): TAgentVaultServiceVariableReferencesInsert[] =>
    findStoredVariableIds(storedText)
      // Resolve leaves an id that names no variable of this project as text, so it gets no row either.
      .filter((variableId) => variableIds.has(variableId))
      .map((variableId) => ({
        serviceId,
        variableId,
        field: target.field,
        customHeaderId: target.customHeaderId ?? null,
        substitutionId: target.substitutionId ?? null
      }));

  const credentialReferenceRowsOf = (
    serviceId: string,
    storedSecret: TCredentialWrite["secret"],
    variableIds: ReadonlySet<string>
  ) =>
    Object.entries(storedSecret ?? {})
      // An SSH key's parts never store a reference.
      .filter(([part]) => part === "username" || part === "password" || part === "value")
      .flatMap(([part, text]) =>
        referenceRowsOf(
          serviceId,
          {
            field:
              part === "username"
                ? AgentVaultVariableReferenceField.CredentialUsername
                : AgentVaultVariableReferenceField.CredentialValue
          },
          text,
          variableIds
        )
      );

  // The reference is stored by id, so a variable deleted after the key lookup is caught when the save locks the
  // rows it references (insertReferenceRows). The deferred foreign key is only the backstop.
  const VARIABLE_DELETED_DURING_SAVE_MESSAGE =
    "A variable this service uses was deleted while it was being saved. Check its variable references and save again.";

  // Every other foreign key a save can trip names a row the save wrote itself or, on update, the service, which
  // a delete removes without taking the bundle lock. So only this one means a variable went away.
  const VARIABLE_REFERENCE_VARIABLE_FOREIGN_KEY = "agent_vault_service_variable_references_variableid_foreign";

  // A variable is deleted under its own row lock, not a bundle's, so a save holds the rows it references until it
  // commits. A delete then waits for the save and sees its references, and an id already gone fails the save here.
  const insertReferenceRows = async (
    projectId: string,
    rows: TAgentVaultServiceVariableReferencesInsert[],
    tx: Knex
  ) => {
    if (!rows.length) return;
    const variableIds = [...new Set(rows.map((row) => row.variableId))];
    const present = await agentVaultVariableDAL.lockForReference({ projectId, owner: null, variableIds }, tx);
    if (present.length !== variableIds.length) {
      throw new BadRequestError({ message: VARIABLE_DELETED_DURING_SAVE_MESSAGE });
    }
    await agentVaultServiceVariableReferenceDAL.insertMany(rows, tx);
  };

  const CREDENTIAL_CHANGED_DURING_SAVE_MESSAGE =
    "This service's credential was changed by another save while this one was in progress. Reload the service and save again.";

  // An authorization only comes from a browser sign-in in the UI, so a machine identity could never hold one.
  const assertOauthConnectedByUser = (ctx: TGetAccessBundleDTO["ctx"], credential?: TAgentVaultCredentialUpdate) => {
    if (
      credential?.type === AgentVaultCredentialType.OAuth &&
      credential.authorizationId &&
      ctx.actor !== ActorType.USER
    ) {
      throw new BadRequestError({ message: "OAuth services can only be connected by a user in the Infisical UI." });
    }
  };

  // The tokens come from an authorization the same user completed. Claiming it deletes it right before the write,
  // and a save that then fails puts it back, so it can be retried without authorizing again.
  const claimOauthCredential = async ({
    projectId,
    ctx,
    serviceId,
    serverUrl,
    authorizationId,
    previousRequiredScopes
  }: {
    projectId: string;
    ctx: TGetAccessBundleDTO["ctx"];
    serviceId?: string;
    serverUrl: string;
    authorizationId: string;
    previousRequiredScopes?: string[];
  }) => {
    const claim = await agentVaultOauthService.claimAuthorization({
      authorizationId,
      projectId,
      serviceId,
      ctx,
      serverUrl
    });
    const build = (requiredScopes?: string[]) =>
      agentVaultOauthService.buildCredentialFromAuthorization(claim.record, { previousRequiredScopes: requiredScopes });
    try {
      return { claim, ...build(previousRequiredScopes), rebuild: build };
    } catch (err) {
      await claim.restore();
      throw err;
    }
  };

  // A bundle the caller cannot reach is a 404, never a 403, which would confirm the id exists.
  const resolveReachableBundle = async ({ projectId, ctx, accessBundleId }: TGetAccessBundleDTO) => {
    const reachability = await getAgentVaultReachability({ permissionService, membershipDAL }, { projectId, ctx });

    const bundle = await agentVaultAccessBundleDAL.findByIdInProject({ id: accessBundleId, projectId });
    // Postgres compares uuids case-insensitively but this list does not, so an uppercase id would miss.
    const unreachable =
      reachability.accessBundleIds && !reachability.accessBundleIds.includes(accessBundleId.toLowerCase());
    if (!bundle || unreachable) {
      throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });
    }

    return { bundle, ...reachability };
  };

  // What a session on the user's behalf could use: the bundles both the user and the caller reach, counted against
  // the user's personal values. Like minting that session, it checks the delegation and then the caller's own bundles
  // before it looks the user up, so a caller granted no bundle learns nothing about who is in the org.
  const $onBehalfOfListScope = async ({
    projectId,
    ctx,
    onBehalfOf,
    callerAccessBundleIds
  }: {
    projectId: string;
    ctx: TListAccessBundlesDTO["ctx"];
    onBehalfOf: NonNullable<TListAccessBundlesDTO["onBehalfOf"]>;
    callerAccessBundleIds: string[] | null;
  }) => {
    const delegation = await findCallerDelegation({ agentVaultDelegationDAL }, { projectId, ctx });
    if (callerAccessBundleIds?.length === 0) {
      return { scopeIds: [] as string[], excludeIds: [] as string[], owner: null };
    }

    const { user, accessBundleIds: userAccessBundleIds } = await resolveOnBehalfOfUser(
      { agentVaultDelegationDAL, userDAL, orgDAL, permissionService, membershipDAL },
      { projectId, ctx, onBehalfOf, delegation }
    );
    return {
      scopeIds: intersectAccessBundleIds(userAccessBundleIds, callerAccessBundleIds),
      excludeIds: [] as string[],
      owner: { userId: user.id }
    };
  };

  // Setup is counted over every bundle the caller reaches, since an admin can start a session on one they were never
  // granted.
  const listAccessBundles = async ({
    projectId,
    ctx,
    requiresSetup,
    granted,
    onBehalfOf,
    ...page
  }: TListAccessBundlesDTO) => {
    const { permission, accessBundleIds, grantedAccessBundleIds } = await getAgentVaultGrantedReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const { scopeIds, excludeIds, owner } = onBehalfOf
      ? await $onBehalfOfListScope({ projectId, ctx, onBehalfOf, callerAccessBundleIds: accessBundleIds })
      : {
          // null is every bundle in the project, which only an admin reaches.
          scopeIds: granted ? grantedAccessBundleIds : accessBundleIds,
          excludeIds: granted === false ? grantedAccessBundleIds : [],
          owner: ownerOrNullOf(ctx)
        };
    const excluded = new Set(excludeIds);
    const pendingByBundleOf = async (bundleIds: string[] | null) => {
      const byBundle = new Map<string, { id: string; name: string }[]>();
      if (!owner || bundleIds?.length === 0) return byBundle;
      const statuses = await agentVaultPersonalValueService.findStatusesForOwner({
        projectId,
        owner,
        accessBundleIds: bundleIds,
        withVariableReferences: false
      });
      statuses.forEach((status) => {
        const bundleId = status.accessBundleId;
        if (status.isConfigured || !bundleId || excluded.has(bundleId)) return;
        byBundle.set(bundleId, [...(byBundle.get(bundleId) ?? []), { id: status.serviceId, name: status.serviceName }]);
      });
      return byBundle;
    };
    const withSetup = (
      accessBundles: TAgentVaultAccessBundleListRow[],
      pendingByBundle: Map<string, { id: string; name: string }[]>
    ) =>
      accessBundles.map((bundle) => ({
        ...bundle,
        servicesRequiringSetup: pendingByBundle.get(bundle.id) ?? []
      }));

    // Either setup filter needs every bundle's status before it can page; the plain list only needs the page's.
    if (requiresSetup !== undefined) {
      const pendingByBundle = await pendingByBundleOf(scopeIds);
      const pendingIds = [...pendingByBundle.keys()];
      const { accessBundles, totalCount } = await agentVaultAccessBundleDAL.findForList({
        projectId,
        ...(requiresSetup
          ? { accessBundleIds: pendingIds }
          : { accessBundleIds: scopeIds, excludeAccessBundleIds: [...excludeIds, ...pendingIds] }),
        ...page
      });
      return { accessBundles: withSetup(accessBundles, pendingByBundle), totalCount };
    }

    const { accessBundles, totalCount } = await agentVaultAccessBundleDAL.findForList({
      projectId,
      accessBundleIds: scopeIds,
      excludeAccessBundleIds: excludeIds,
      ...page
    });
    const pendingByBundle = await pendingByBundleOf(accessBundles.map((bundle) => bundle.id));
    return { accessBundles: withSetup(accessBundles, pendingByBundle), totalCount };
  };

  const getAccessBundleById = async (dto: TGetAccessBundleDTO) => {
    const { bundle, permission } = await resolveReachableBundle(dto);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    const { canReadVariables, canSeeSetup } = serviceVisibilityOf(permission);

    const services = await agentVaultServiceDAL.findByAccessBundleId(bundle.id);
    const { customHeaders, substitutions, variableReferences } = await loadTransformations(
      services.map((service) => service.id),
      undefined,
      { withVariableReferences: canReadVariables }
    );
    const owner = ownerOrNullOf(dto.ctx);
    const statuses = owner
      ? await agentVaultPersonalValueService.findStatusesForOwner({
          projectId: dto.projectId,
          owner,
          accessBundleIds: [bundle.id]
        })
      : [];

    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description ?? null,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      services: services.map((service) => ({
        // The bundle being read. Python SDK v1.4.0 and older fail to parse a service without it.
        accessBundleId: bundle.id,
        ...viewService(
          service,
          { customHeaders, substitutions, variableReferences },
          { canReadVariables, canSeeSetup, status: statuses.find((entry) => entry.serviceId === service.id) }
        )
      }))
    };
  };

  const createAccessBundle = async ({ projectId, ctx, name, description }: TCreateAccessBundleDTO) => {
    const { permission } = await getAgentVaultReachability({ permissionService, membershipDAL }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Create,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const existing = await agentVaultAccessBundleDAL.findOne({ projectId, name });
    if (existing) {
      throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
    }

    let creatorColumn: TGrantActorColumn | null = null;
    if (ctx.actor === ActorType.USER) creatorColumn = "actorUserId";
    else if (ctx.actor === ActorType.IDENTITY) creatorColumn = "actorIdentityId";

    const create = () =>
      agentVaultAccessBundleDAL.transaction(async (tx) => {
        const bundle = await agentVaultAccessBundleDAL.create({ projectId, name, description }, tx);

        if (creatorColumn) {
          const direct = await membershipDAL.findOne(
            { scope: AccessScope.Project, scopeProjectId: projectId, [creatorColumn]: ctx.actorId },
            tx
          );
          if (direct) {
            await writeGrants(
              {
                projectId,
                orgId: ctx.actorOrgId,
                accessBundleId: bundle.id,
                actors: [{ actorColumn: creatorColumn, actorId: ctx.actorId }]
              },
              tx
            );
          }
        }

        return bundle;
      });

    try {
      return await create();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
      }
      throw err;
    }
  };

  const updateAccessBundle = async ({ accessBundleId, name, description, ...rest }: TUpdateAccessBundleDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    if (name && name !== bundle.name) {
      const existing = await agentVaultAccessBundleDAL.findOne({ projectId: rest.projectId, name });
      if (existing) throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
    }

    try {
      return await agentVaultAccessBundleDAL.updateById(bundle.id, { name, description });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
      }
      throw err;
    }
  };

  const deleteAccessBundle = async ({ accessBundleId, ...rest }: TDeleteAccessBundleDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Delete,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    // Locks in the order every path takes them, bundle row, services, grants, values, so this can't deadlock with
    // a grant, a personal values save or a removal. The services stay in the project; the delete only takes their links,
    // and roles go with the grants. Whoever the bundle gave a service to keeps what they saved for it only while
    // another bundle still gives it to them.
    return agentVaultAccessBundleDAL.transaction(async (tx) => {
      await agentVaultAccessBundleDAL.lockByIdInProject({ id: bundle.id, projectId: rest.projectId }, tx);
      const services = await agentVaultServiceDAL.lockByAccessBundleId(bundle.id, tx);
      const grants = await membershipDAL.delete(bundleScope(rest.projectId, bundle.id), tx);
      const deleted = await agentVaultAccessBundleDAL.deleteById(bundle.id, tx);
      await clearPersonalValuesAfterRevoke(
        { agentVaultPersonalValueDAL, userGroupMembershipDAL, identityGroupMembershipDAL },
        {
          projectId: rest.projectId,
          serviceIds: services.map((service) => service.id),
          userIds: grants.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])),
          identityIds: grants.flatMap((row) => (row.actorIdentityId ? [row.actorIdentityId] : [])),
          groupIds: grants.flatMap((row) => (row.actorGroupId ? [row.actorGroupId] : []))
        },
        tx
      );
      return deleted;
    });
  };

  // A bundle can't hold two services covering the same host, so a service is checked against every bundle it is or
  // will be in.
  const checkHostPatternConflicts = async (
    {
      accessBundles,
      hostPattern,
      excludeServiceId,
      addingName
    }: {
      accessBundles: { id: string; name: string }[];
      hostPattern: string | null;
      excludeServiceId?: string;
      // Names the service being added, for a request that adds several.
      addingName?: string;
    },
    // Without a tx this reads the replica outside any lock, so two creates for the same host both pass.
    tx?: Knex
  ) => {
    if (!hostPattern) return;
    for (const bundle of accessBundles) {
      // eslint-disable-next-line no-await-in-loop
      const siblings = await agentVaultServiceDAL.findByAccessBundleId(bundle.id, tx);
      const conflicts = findHostPatternConflicts(
        hostPattern,
        siblings.filter((candidate) => candidate.id !== excludeServiceId)
      );
      if (conflicts.length) {
        const message = describeConflict(conflicts[0], bundle.name);
        throw new BadRequestError({ message: addingName ? `Can't add '${addingName}': ${message}` : message });
      }
    }
  };

  const lockServiceNames = (projectId: string, tx: Knex) =>
    tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.AgentVaultServiceNames(projectId)]);

  // `details.field` names the input at fault, so the service sheet can show it on the Name field.
  const serviceNameTaken = (name: string) =>
    new BadRequestError({
      message: `A service named '${name}' already exists in this project. Choose another name.`,
      details: { field: "name" }
    });

  // The bundles a request names, all in the project, each once, in the order given.
  const findBundlesInProject = async (projectId: string, accessBundleIds: string[], tx?: Knex) => {
    const bundles: { id: string; name: string }[] = [];
    for (const id of [...new Set(accessBundleIds.map((bundleId) => bundleId.toLowerCase()))]) {
      // eslint-disable-next-line no-await-in-loop
      const bundle = await agentVaultAccessBundleDAL.findByIdInProject({ id, projectId }, tx);
      if (!bundle) throw new NotFoundError({ message: `Access bundle with ID '${id}' not found` });
      bundles.push({ id: bundle.id, name: bundle.name });
    }
    return bundles;
  };

  const requireServiceWrite = async (dto: { projectId: string; ctx: TGetAccessBundleDTO["ctx"] }) => {
    const { permission } = await getAgentVaultReachability({ permissionService, membershipDAL }, dto);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
  };

  const createService = async ({
    accessBundleIds = [],
    type,
    name,
    description,
    hostPattern: requestedHostPattern,
    serverUrl,
    transport,
    host,
    port,
    database,
    tls,
    allowedMethods,
    allowedPathPrefixes,
    allowedTools,
    credential,
    customHeaders,
    substitutions,
    hook,
    ...rest
  }: TCreateServiceDTO) => {
    await requireServiceWrite(rest);
    assertOauthConnectedByUser(rest.ctx, credential);
    if (hook) await assertAgentVaultHooksOnPlan(licenseService, rest.ctx.actorOrgId);
    const bundles = await findBundlesInProject(rest.projectId, accessBundleIds);

    const serviceType = getAgentVaultServiceType(type);
    assertServiceFieldsSupported(serviceType, {
      hostPattern: requestedHostPattern,
      allowedMethods,
      allowedPathPrefixes,
      allowedTools,
      customHeaders,
      substitutions,
      serverUrl,
      transport,
      host,
      port,
      database,
      tls
    });
    assertCredentialTypeSupported(serviceType, credential.type);
    const serviceConfig = buildServiceConfig(serviceType, {
      serverUrl,
      transport,
      host,
      port,
      database,
      tls: toNativeTlsConfigInput(tls)
    });
    const hostPattern = resolveServiceHostPattern(serviceType, serviceConfig, requestedHostPattern);

    if (await agentVaultServiceDAL.findByNameInProject({ name, projectId: rest.projectId })) {
      throw serviceNameTaken(name);
    }

    await checkHostPatternConflicts({ accessBundles: bundles, hostPattern });

    const { idOfKey, variableIds } = await loadProjectVariables(rest.projectId, [
      ...credentialReferenceTexts(credential),
      ...(customHeaders ?? []).map((header) => ({ label: `The custom header '${header.name}'`, text: header.value })),
      ...(substitutions ?? []).map((substitution) => ({
        label: `The substitution for '${substitution.placeholder}'`,
        text: substitution.value
      }))
    ]);
    const store = (text: string) => toStoredVariableReferences(text, idOfKey);

    // Encrypt before the lock: KMS is a network call and the transaction has to stay short.
    const split =
      credential.type === AgentVaultCredentialType.OAuth
        ? null
        : splitCredential(storeCredentialReferences(credential, store));
    if (split && isNativeServiceType(serviceType.type)) assertNativeBasicHasUsername(split);
    assertCustomHeadersDoNotShadowCredential(split ? split.config : { type: credential.type }, customHeaders);
    const secret = split?.secret ?? null;

    const { encryptor } = await getProjectCipher(rest.projectId);
    const seal = (value: string) => encryptor({ plainText: Buffer.from(JSON.stringify({ value })) }).cipherTextBlob;
    // Stored once, so the sealed text and the references read off it are the same string.
    const storedCustomHeaderValues = (customHeaders ?? []).map((header) => store(header.value));
    const storedSubstitutionValues = (substitutions ?? []).map((substitution) => store(substitution.value));
    const customHeaderRows = (customHeaders ?? []).map((header, position) => ({
      name: header.name,
      prefix: header.prefix ?? "",
      position,
      encryptedValue: seal(storedCustomHeaderValues[position])
    }));
    const substitutionRows = (substitutions ?? []).map((substitution, position) => ({
      placeholder: substitution.placeholder,
      surfaces: substitution.surfaces,
      position,
      encryptedValue: seal(storedSubstitutionValues[position])
    }));
    const encryptedHookSecret = hook ? seal(hook.signingSecret) : null;

    const memberOauth =
      credential.type === AgentVaultCredentialType.OAuth && memberFieldsOf(credential)
        ? await agentVaultOauthService.prepareMemberOauth({
            serverUrl: serviceConfig.serverUrl!,
            clientId: credential.clientId,
            clientSecret: credential.clientSecret
          })
        : null;
    if (credential.type === AgentVaultCredentialType.OAuth && !memberOauth && !credential.authorizationId) {
      throw new BadRequestError({ message: OAUTH_NEEDS_AUTHORIZATION_OR_MEMBERS_MESSAGE });
    }
    const oauth =
      credential.type === AgentVaultCredentialType.OAuth && credential.authorizationId
        ? await claimOauthCredential({
            projectId: rest.projectId,
            ctx: rest.ctx,
            serverUrl: serviceConfig.serverUrl!,
            authorizationId: credential.authorizationId
          })
        : null;
    const credentialConfig: TAgentVaultCredentialConfig = oauth?.config ?? memberOauth?.config ?? split!.config;
    const memberProvidedFields = memberOauth
      ? [AgentVaultVariableReferenceField.CredentialValue]
      : (split?.memberProvidedFields ?? null);
    let encryptedCredential: Buffer | null = null;
    if (oauth) encryptedCredential = oauth.encryptedCredential;
    else if (memberOauth?.clientSecret) {
      encryptedCredential = encryptor({
        plainText: Buffer.from(JSON.stringify({ clientSecret: memberOauth.clientSecret }))
      }).cipherTextBlob;
    } else if (secret)
      encryptedCredential = encryptor({ plainText: Buffer.from(JSON.stringify(secret)) }).cipherTextBlob;

    // The pre-checks above are only a fast failure. The authoritative ones run under the project's service-name lock and
    // the bundle row locks, because no database constraint can express host-pattern overlap.
    const write = () =>
      agentVaultServiceDAL.transaction(async (tx) => {
        await lockServiceNames(rest.projectId, tx);
        for (const bundle of [...bundles].sort((a, b) => a.id.localeCompare(b.id))) {
          // eslint-disable-next-line no-await-in-loop
          const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
            { id: bundle.id, projectId: rest.projectId },
            tx
          );
          if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${bundle.id}' not found` });
        }
        await checkHostPatternConflicts({ accessBundles: bundles, hostPattern }, tx);

        const created = await agentVaultServiceDAL.create(
          {
            projectId: rest.projectId,
            name,
            description: description ?? null,
            type: serviceType.type,
            config: serviceConfig,
            hostPattern,
            allowedMethods: allowedMethods ?? null,
            allowedPathPrefixes: allowedPathPrefixes ?? null,
            allowedTools: allowedTools ?? null,
            credentialType: credential.type,
            credentialConfig,
            encryptedCredential,
            memberProvidedFields,
            hookUrl: hook?.url ?? null,
            encryptedHookSecret
          },
          tx
        );

        const insertedCustomHeaders = customHeaderRows.length
          ? await agentVaultServiceCustomHeaderDAL.insertMany(
              customHeaderRows.map((row) => ({ ...row, serviceId: created.id })),
              tx
            )
          : [];
        const insertedSubstitutions = substitutionRows.length
          ? await agentVaultServiceSubstitutionDAL.insertMany(
              substitutionRows.map((row) => ({ ...row, serviceId: created.id })),
              tx
            )
          : [];

        const referenceRows = [
          ...credentialReferenceRowsOf(created.id, secret, variableIds),
          ...insertedCustomHeaders.flatMap((row) =>
            referenceRowsOf(
              created.id,
              { field: AgentVaultVariableReferenceField.CustomHeader, customHeaderId: row.id },
              storedCustomHeaderValues[row.position],
              variableIds
            )
          ),
          ...insertedSubstitutions.flatMap((row) =>
            referenceRowsOf(
              created.id,
              { field: AgentVaultVariableReferenceField.Substitution, substitutionId: row.id },
              storedSubstitutionValues[row.position],
              variableIds
            )
          )
        ];
        await insertReferenceRows(rest.projectId, referenceRows, tx);
        const variableReferences = referenceRows.length
          ? await agentVaultServiceVariableReferenceDAL.findByServiceIds([created.id], tx)
          : [];
        await agentVaultServiceDAL.insertLinks(
          bundles.map((bundle) => ({ accessBundleId: bundle.id, serviceId: created.id })),
          tx
        );

        return { created, insertedCustomHeaders, insertedSubstitutions, variableReferences };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      await oauth?.claim.restore();
      if (isUniqueViolation(err)) {
        throw serviceNameTaken(name);
      }
      if (
        hasPostgresConstraintViolation(
          err,
          DatabaseErrorCode.ForeignKeyViolation,
          VARIABLE_REFERENCE_VARIABLE_FOREIGN_KEY
        )
      ) {
        throw new BadRequestError({ message: VARIABLE_DELETED_DURING_SAVE_MESSAGE });
      }
      throw err;
    }

    return {
      service: {
        ...projectService(
          result.created as TAgentVaultCatalogService,
          result.insertedCustomHeaders,
          result.insertedSubstitutions,
          result.variableReferences
        ),
        accessBundles: bundles
      }
    };
  };

  const updateService = async ({
    serviceId,
    type,
    name,
    description,
    credential,
    customHeaders: sentCustomHeaders,
    hostPattern: sentHostPattern,
    serverUrl: sentServerUrl,
    transport: sentTransport,
    host: sentHost,
    port: sentPort,
    database: sentDatabase,
    tls: sentTls,
    allowedMethods: sentAllowedMethods,
    allowedPathPrefixes: sentAllowedPathPrefixes,
    allowedTools: sentAllowedTools,
    substitutions: sentSubstitutions,
    hook,
    ...rest
  }: TUpdateServiceDTO) => {
    await requireServiceWrite(rest);
    assertOauthConnectedByUser(rest.ctx, credential);

    const service = await agentVaultServiceDAL.findByIdInProject({ id: serviceId, projectId: rest.projectId });
    if (!service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
    const bundlesOf = async (tx?: Knex) =>
      (await agentVaultServiceDAL.findBundlesForServices([service.id], null, tx)).get(service.id) ?? [];

    const serviceType = getAgentVaultServiceType(service.type);
    if (type !== service.type) {
      throw new BadRequestError({
        message: `The service '${service.name}' is ${serviceType.article.toLowerCase()} ${serviceType.label} service, so send 'type': '${service.type}'. A service's type can't be changed; create a new service of the other type instead.`
      });
    }
    const sentFields = dropReadBackServiceFields(
      serviceType,
      {
        hostPattern: sentHostPattern,
        serverUrl: sentServerUrl,
        transport: sentTransport,
        host: sentHost,
        port: sentPort,
        database: sentDatabase,
        tls: sentTls,
        allowedMethods: sentAllowedMethods,
        allowedPathPrefixes: sentAllowedPathPrefixes,
        allowedTools: sentAllowedTools,
        customHeaders: sentCustomHeaders,
        substitutions: sentSubstitutions
      },
      service.hostPattern ?? null
    );
    // Read back like the type's other fields: the URL it already has with no new secret, or null with none stored.
    const hookChange = classifyHookUpdate(hook, service.hookUrl);
    // The schema's check sees the read-back fields too, so a request holding only those reaches here with nothing to
    // change.
    if (
      [name, description, credential, hookChange, ...Object.values(sentFields)].every((value) => value === undefined)
    ) {
      throw new BadRequestError({ message: "Provide at least one field besides 'type' to update" });
    }
    if (hookChange && hookChange.kind !== "removed") {
      await assertAgentVaultHooksOnPlan(licenseService, rest.ctx.actorOrgId);
    }
    const requestedHostPattern = sentFields.hostPattern ?? undefined;
    const { allowedMethods, allowedPathPrefixes, allowedTools, customHeaders, substitutions } = sentFields;
    const serverUrl = sentFields.serverUrl ?? undefined;
    const transport = sentFields.transport ?? undefined;
    const host = sentFields.host ?? undefined;
    const port = sentFields.port ?? undefined;
    const database = sentFields.database ?? undefined;
    const tls = toNativeTlsConfigInput(sentFields.tls ?? undefined);
    assertServiceFieldsSupported(serviceType, {
      hostPattern: requestedHostPattern,
      allowedMethods,
      allowedPathPrefixes,
      allowedTools,
      customHeaders,
      substitutions,
      serverUrl,
      transport,
      host,
      port,
      database,
      tls
    });
    if (credential) assertCredentialTypeSupported(serviceType, credential.type);

    // The fields of the type's config this request sent. Ones left out keep their stored value, so the config
    // is merged here for the fast checks and again under the lock against the row read there.
    const configUpdate = shake({ serverUrl, transport, host, port, database, tls }, (value) => value === undefined);
    const hasConfigUpdate = Object.keys(configUpdate).length > 0;
    const deriveHostPattern = (config: TAgentVaultServiceConfig) =>
      resolveServiceHostPattern(serviceType, config, requestedHostPattern);
    const serviceConfig = hasConfigUpdate ? buildServiceConfig(serviceType, configUpdate, service.config) : undefined;
    const hostPattern =
      serviceConfig && serviceType.deriveHostPattern ? deriveHostPattern(serviceConfig) : requestedHostPattern;

    const storedMemberOauth = isMemberProvidedOauth(service)
      ? (service.credentialConfig as TAgentVaultOauthMemberConfig)
      : undefined;
    const storedOauth =
      service.credentialType === AgentVaultCredentialType.OAuth && !storedMemberOauth
        ? (service.credentialConfig as TAgentVaultOauthConfig)
        : undefined;
    const oauthAuthorizationId =
      credential?.type === AgentVaultCredentialType.OAuth ? credential.authorizationId : undefined;
    const storedServerUrl = getServiceServerUrl(service.config);
    const serverUrlChanged = serverUrl !== undefined && serverUrl !== storedServerUrl;
    // Whether each member signs in once this update is applied. Their tokens are bound to the server and client, so
    // the service keeps no tokens of its own that a server change would need reauthorized.
    const endsMemberOauth = credential
      ? credential.type === AgentVaultCredentialType.OAuth && Boolean(nextMemberFieldsOf(credential, service)?.length)
      : Boolean(storedMemberOauth);
    const staysOauth = credential ? credential.type === AgentVaultCredentialType.OAuth : Boolean(storedOauth);
    if (serverUrlChanged && staysOauth && !endsMemberOauth && !oauthAuthorizationId) {
      throw new BadRequestError({ message: OAUTH_SERVER_URL_NEEDS_AUTHORIZATION_MESSAGE });
    }
    if (credential?.type === AgentVaultCredentialType.OAuth && !endsMemberOauth && !oauthAuthorizationId) {
      throw new BadRequestError({ message: OAUTH_NEEDS_AUTHORIZATION_OR_MEMBERS_MESSAGE });
    }

    if (name && name !== service.name) {
      if (await agentVaultServiceDAL.findByNameInProject({ name, projectId: rest.projectId })) {
        throw serviceNameTaken(name);
      }
    }

    if (hostPattern && hostPattern !== service.hostPattern) {
      await checkHostPatternConflicts({
        accessBundles: await bundlesOf(),
        hostPattern,
        excludeServiceId: service.id
      });
    }

    // A basic update that rewrites the secret keeps any admin half it left out from the sealed secret read here,
    // before the lock, so the write re-checks under the lock that nothing replaced it since. A half that was
    // member-provided has nothing stored to keep.
    const previousMemberFields = (service.memberProvidedFields ?? []) as TAgentVaultMemberProvidedField[];
    const nextMemberFields = credential ? nextMemberFieldsOf(credential, service) : null;
    const credentialTypeChanged = credential !== undefined && credential.type !== service.credentialType;
    const memberFieldsChanged =
      credentialTypeChanged ||
      (credential !== undefined && !sameMemberProvidedFields(nextMemberFields, previousMemberFields));
    const needsStoredSecret = credential !== undefined && needsStoredSecretFor(credential, service);
    const storedSecretCipher = needsStoredSecret ? await getProjectCipher(rest.projectId) : null;
    const storedSecret = storedSecretCipher
      ? (JSON.parse(
          storedSecretCipher.decryptor({ cipherTextBlob: service.encryptedCredential! }).toString("utf-8")
        ) as Record<string, string>)
      : null;

    // Only the values that arrived. One left out keeps what is sealed, and so keeps its references.
    const { idOfKey, variableIds } = await loadProjectVariables(
      rest.projectId,
      [
        ...(credential ? credentialReferenceTexts(credential) : []),
        ...(customHeaders ?? []).flatMap((header) =>
          header.value === undefined ? [] : [{ label: `The custom header '${header.name}'`, text: header.value }]
        ),
        ...(substitutions ?? []).flatMap((substitution) =>
          substitution.value === undefined
            ? []
            : [{ label: `The substitution for '${substitution.placeholder}'`, text: substitution.value }]
        )
      ],
      storedSecret ? Object.values(storedSecret) : []
    );
    const store = (text: string) => toStoredVariableReferences(text, idOfKey);

    let credentialUpdate = {};
    // Undefined leaves the sealed secret, and the references read off it, as they are.
    let writtenSecret: TCredentialWrite["secret"];
    let credentialReplaced = false;
    let effectiveCredentialConfig = service.credentialConfig as TAgentVaultCredentialConfig;
    // A new OAuth authorization is claimed right before the write.
    if (credential && credential.type !== AgentVaultCredentialType.OAuth) {
      const { config, secret, memberProvidedFields } = mergeCredential(
        storeCredentialReferences(credential, store),
        service,
        storedSecret
      );
      let encryptedCredential: Buffer | null | undefined;
      if (secret === null) encryptedCredential = null;
      if (secret) {
        const { encryptor } = storedSecretCipher ?? (await getProjectCipher(rest.projectId));
        encryptedCredential = encryptor({ plainText: Buffer.from(JSON.stringify(secret)) }).cipherTextBlob;
      }
      if (isNativeServiceType(serviceType.type)) assertNativeBasicHasUsername({ config, secret, memberProvidedFields });
      writtenSecret = secret;
      credentialReplaced = isStoredSecretReplaced(credential, service, secret);

      credentialUpdate = {
        credentialType: credential.type,
        credentialConfig: config,
        memberProvidedFields,
        ...(encryptedCredential === undefined ? {} : { encryptedCredential })
      };
      effectiveCredentialConfig = config;
    }

    let memberOauth: Awaited<ReturnType<typeof agentVaultOauthService.prepareMemberOauth>> | null = null;
    let oauthMembersRebound = false;
    if (endsMemberOauth && (credential?.type === AgentVaultCredentialType.OAuth || serverUrlChanged)) {
      const oauthCredential = credential?.type === AgentVaultCredentialType.OAuth ? credential : undefined;
      memberOauth = await agentVaultOauthService.prepareMemberOauth({
        serverUrl: getServiceServerUrl(serviceConfig ?? service.config)!,
        clientId:
          oauthCredential?.registration === AgentVaultOauthRegistration.Dynamic
            ? null
            : (oauthCredential?.clientId ?? storedMemberOauth?.clientId ?? null),
        clientSecret: oauthCredential?.clientSecret
      });
      const { sameClient, membersRebound } = memberOauthChangeOf({
        next: memberOauth.config,
        stored: storedMemberOauth,
        clientSecretSent: oauthCredential?.clientSecret !== undefined
      });
      // A client is registered at one issuer, so its stored secret is never sent to another.
      if (
        storedMemberOauth &&
        !sameClient &&
        !memberOauth.clientSecret &&
        memberOauth.config.registration === AgentVaultOauthRegistration.Manual &&
        memberOauth.config.clientId === storedMemberOauth.clientId &&
        service.encryptedCredential
      ) {
        throw new BadRequestError({
          message:
            "The server now signs in through a different OAuth issuer, so the stored client secret won't be sent to it. Enter the client secret again, or the client ID and secret of an OAuth app registered with the new issuer."
        });
      }
      oauthMembersRebound = membersRebound;

      // The admin-entered client's secret is kept unless one was sent or the client changed. Anything else the row
      // sealed (a shared sign-in's tokens, a bearer token) goes.
      let encryptedCredential: Buffer | null | undefined = null;
      if (memberOauth.clientSecret) {
        const { encryptor } = await getProjectCipher(rest.projectId);
        encryptedCredential = encryptor({
          plainText: Buffer.from(JSON.stringify({ clientSecret: memberOauth.clientSecret }))
        }).cipherTextBlob;
      } else if (sameClient && memberOauth.config.registration === AgentVaultOauthRegistration.Manual) {
        encryptedCredential = undefined;
      }
      credentialUpdate = {
        credentialType: AgentVaultCredentialType.OAuth,
        credentialConfig: memberOauth.config,
        memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue],
        ...(encryptedCredential === undefined ? {} : { encryptedCredential })
      };
      effectiveCredentialConfig = memberOauth.config;
      if (!storedMemberOauth) writtenSecret = null;
      credentialReplaced =
        encryptedCredential !== undefined && (Boolean(service.encryptedCredential) || encryptedCredential !== null);
    }

    const newHookSigningSecret = hookChange && hookChange.kind !== "removed" ? hookChange.signingSecret : undefined;
    const cipherForTransformations =
      customHeaders?.length || substitutions?.length || newHookSigningSecret !== undefined
        ? await getProjectCipher(rest.projectId)
        : null;
    const seal = (storedValue: string | undefined) =>
      storedValue === undefined
        ? undefined
        : cipherForTransformations!.encryptor({ plainText: Buffer.from(JSON.stringify({ value: storedValue })) })
            .cipherTextBlob;

    // Stored once, so the sealed text and the references read off it are the same string.
    const storedCustomHeaderValues = (customHeaders ?? []).map((header) =>
      header.value === undefined ? undefined : store(header.value)
    );
    const storedSubstitutionValues = (substitutions ?? []).map((substitution) =>
      substitution.value === undefined ? undefined : store(substitution.value)
    );

    const customHeaderWrites: TTransformationWrite<{ name: string; prefix: string }>[] | undefined = customHeaders?.map(
      (header, index) => ({
        id: header.id,
        naturalKey: header.name.toLowerCase(),
        label: header.name,
        // An omitted prefix is cleared, not kept: it comes back in the response so a caller can resend it,
        // which is the thing a sealed value can never do.
        columns: { name: header.name, prefix: header.prefix ?? "" },
        encryptedValue: seal(storedCustomHeaderValues[index])
      })
    );

    const substitutionWrites:
      | TTransformationWrite<{ placeholder: string; surfaces: AgentVaultSubstitutionSurface[] }>[]
      | undefined = substitutions?.map((substitution, index) => ({
      id: substitution.id,
      naturalKey: substitution.placeholder,
      label: substitution.placeholder,
      columns: { placeholder: substitution.placeholder, surfaces: substitution.surfaces },
      encryptedValue: seal(storedSubstitutionValues[index])
    }));

    const encryptedHookSecret = seal(newHookSigningSecret);

    const oauth = oauthAuthorizationId
      ? await claimOauthCredential({
          projectId: rest.projectId,
          ctx: rest.ctx,
          serviceId: service.id,
          serverUrl: getServiceServerUrl(serviceConfig ?? service.config)!,
          authorizationId: oauthAuthorizationId,
          previousRequiredScopes: storedOauth?.requiredScopes
        })
      : null;
    if (oauth) {
      credentialUpdate = {
        credentialType: AgentVaultCredentialType.OAuth,
        credentialConfig: oauth.config,
        encryptedCredential: oauth.encryptedCredential,
        memberProvidedFields: null
      };
      // Clears the old credential's variable references, since OAuth tokens never hold one.
      writtenSecret = null;
      credentialReplaced = true;
      effectiveCredentialConfig = oauth.config;
    }

    // Every rule about a save that committed between the read above and the bundle lock, run against the one row
    // read under the lock. That save may have moved the service, retyped or rotated its credential, or
    // reauthorized it, and writing over it from the first read would undo it. Pure, so it can't touch the database.
    const reconcileWithLockedRow = (locked: TAgentVaultServices) => {
      const lockedOauth =
        locked.credentialType === AgentVaultCredentialType.OAuth && !isMemberProvidedOauth(locked)
          ? (locked.credentialConfig as TAgentVaultOauthConfig)
          : undefined;
      let lockedServiceConfig = serviceConfig;
      let lockedHostPattern = hostPattern;
      let lockedCredentialUpdate = credentialUpdate;
      let lockedCredentialConfig = locked.credentialConfig as TAgentVaultCredentialConfig;

      if (hasConfigUpdate) {
        lockedServiceConfig = buildServiceConfig(serviceType, configUpdate, locked.config);
        if (serviceType.deriveHostPattern) lockedHostPattern = deriveHostPattern(lockedServiceConfig);
        // An edit that keeps the tokens must still point at the server they were authorized for.
        if (
          lockedOauth &&
          !oauth &&
          !memberOauth &&
          (!credential || credential.type === AgentVaultCredentialType.OAuth)
        ) {
          checkOauthServerUnderLock({
            requestedServerUrl: serverUrl,
            readServerUrl: storedServerUrl,
            effectiveServerUrl: getServiceServerUrl(lockedServiceConfig),
            lockedOauth
          });
        }
      }

      // A save that leaves the members' sign-in alone must not move the service off the server it is bound to.
      if (
        lockedServiceConfig &&
        !memberOauth &&
        !oauth &&
        !credential &&
        isMemberProvidedOauth(locked) &&
        getServiceServerUrl(lockedServiceConfig) !== (locked.credentialConfig as TAgentVaultOauthMemberConfig).serverUrl
      ) {
        throw new ConflictError({ message: CREDENTIAL_CHANGED_DURING_SAVE_MESSAGE });
      }

      // The members' sign-in was checked against the first read's server and client, and decides whose connections
      // go, so a save that changed either since must not be written over.
      if (
        memberOauth &&
        storedMemberOauth &&
        (!isMemberProvidedOauth(locked) || memberOauthSetupOf(locked) !== memberOauthSetupOf(service))
      ) {
        throw new ConflictError({ message: CREDENTIAL_CHANGED_DURING_SAVE_MESSAGE });
      }
      // A service switched to member sign-in has no stored member config to compare, but its sign-in was still
      // prepared for the first read's server.
      if (memberOauth && memberOauth.config.serverUrl !== getServiceServerUrl(lockedServiceConfig ?? locked.config)) {
        throw new ConflictError({ message: CREDENTIAL_CHANGED_DURING_SAVE_MESSAGE });
      }
      if (memberOauth) lockedCredentialConfig = effectiveCredentialConfig;

      if (credential) {
        // The credential was merged against the first read, whose type decided how the request reads. Writing
        // over a newer one would set a half this request left out back to an older value.
        const secretChanged =
          storedSecret !== null && !locked.encryptedCredential?.equals(service.encryptedCredential!);
        if (
          locked.credentialType !== service.credentialType ||
          !sameMemberProvidedFields(locked.memberProvidedFields, service.memberProvidedFields) ||
          secretChanged
        ) {
          throw new ConflictError({ message: CREDENTIAL_CHANGED_DURING_SAVE_MESSAGE });
        }
        lockedCredentialConfig = effectiveCredentialConfig;
        // An SSH key save that writes no secret took its config from the first read, whose `hasCertificate` may no
        // longer describe the secret a concurrent save sealed. A removal of a certificate this request never saw
        // can't be applied to it.
        if (credential.type === AgentVaultCredentialType.SshKey && writtenSecret === undefined) {
          const sshKeyChanged =
            storedHasCertificate(locked) !== storedHasCertificate(service) ||
            !locked.encryptedCredential?.equals(service.encryptedCredential!);
          if (credential.certificate === null && sshKeyChanged) {
            throw new ConflictError({ message: CREDENTIAL_CHANGED_DURING_SAVE_MESSAGE });
          }
          lockedCredentialConfig = locked.credentialConfig as TAgentVaultCredentialConfig;
          lockedCredentialUpdate = { ...credentialUpdate, credentialConfig: lockedCredentialConfig };
        }
        if (oauth && credential.type === AgentVaultCredentialType.OAuth) {
          // The claim checked the server URL of the first read; these tokens must never reach another host.
          const requiredScopes = checkOauthClaimUnderLock({
            authorizedServerUrl: oauth.claim.record.serverUrl,
            authorizedIssuer: oauth.claim.record.issuer,
            lockedServerUrl: getServiceServerUrl(lockedServiceConfig ?? locked.config),
            readOauth: storedOauth,
            lockedOauth
          });
          const rebuilt = oauth.rebuild(requiredScopes);
          lockedCredentialUpdate = {
            credentialType: AgentVaultCredentialType.OAuth,
            credentialConfig: rebuilt.config,
            encryptedCredential: rebuilt.encryptedCredential,
            memberProvidedFields: null
          };
          lockedCredentialConfig = rebuilt.config;
        }
      }

      // Setting a hook means there was none, and changing or removing one means there was one; a save in between
      // decides what this request means.
      if (hookChange && (hookChange.kind === "set") === Boolean(locked.hookUrl)) {
        throw new ConflictError({ message: AGENT_VAULT_HOOK_CHANGED_DURING_SAVE_MESSAGE });
      }

      return {
        serviceConfig: lockedServiceConfig,
        hostPattern: lockedHostPattern,
        credentialUpdate: lockedCredentialUpdate,
        credentialConfig: lockedCredentialConfig
      };
    };

    // Same lock as create, and below the credential work so no KMS call sits inside the transaction.
    const write = () =>
      agentVaultServiceDAL.transaction(async (tx) => {
        // Links change only under this lock, so the bundles read next stay the service's until commit.
        await lockServiceNames(rest.projectId, tx);
        const bundles = await bundlesOf(tx);
        for (const bundle of [...bundles].sort((a, b) => a.id.localeCompare(b.id))) {
          // eslint-disable-next-line no-await-in-loop
          await agentVaultAccessBundleDAL.lockByIdInProject({ id: bundle.id, projectId: rest.projectId }, tx);
        }

        const locked = await agentVaultServiceDAL.lockByIdInProject({ id: service.id, projectId: rest.projectId }, tx);
        if (!locked) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
        const reconciled = reconcileWithLockedRow(locked);
        const tlsCaChanged = reconciled.serviceConfig
          ? describeNativeTlsCaChange(locked.config, reconciled.serviceConfig)
          : undefined;
        let hookColumns: { hookUrl: string | null; encryptedHookSecret?: Buffer | null } | undefined;
        if (hookChange?.kind === "removed") hookColumns = { hookUrl: null, encryptedHookSecret: null };
        else if (hookChange) {
          hookColumns = { hookUrl: hookChange.url, ...(encryptedHookSecret ? { encryptedHookSecret } : {}) };
        }
        const hookAudit = hookChange ? describeHookChange(hookChange, locked.hookUrl) : undefined;

        // Only when the pattern actually changes, against the siblings read under the lock.
        if (reconciled.hostPattern && reconciled.hostPattern !== locked.hostPattern) {
          await checkHostPatternConflicts(
            { accessBundles: bundles, hostPattern: reconciled.hostPattern, excludeServiceId: service.id },
            tx
          );
        }

        if (credential || customHeaders) {
          const effectiveCustomHeaders =
            customHeaders ??
            (await agentVaultServiceCustomHeaderDAL.findByServiceIds([service.id], tx)).map((row) => ({
              name: row.name
            }));
          assertCustomHeadersDoNotShadowCredential(reconciled.credentialConfig, effectiveCustomHeaders);
        }

        const hasColumnUpdate =
          name !== undefined ||
          description !== undefined ||
          reconciled.hostPattern !== undefined ||
          reconciled.serviceConfig !== undefined ||
          allowedMethods !== undefined ||
          allowedPathPrefixes !== undefined ||
          allowedTools !== undefined ||
          Object.keys(reconciled.credentialUpdate).length > 0 ||
          hookColumns !== undefined;

        const updatedService = hasColumnUpdate
          ? await agentVaultServiceDAL.updateById(
              service.id,
              {
                name,
                hostPattern: reconciled.hostPattern,
                ...(reconciled.serviceConfig === undefined ? {} : { config: reconciled.serviceConfig }),
                ...(description === undefined ? {} : { description }),
                // `null` clears the restriction, `undefined` leaves the column alone.
                ...(allowedMethods === undefined ? {} : { allowedMethods }),
                ...(allowedPathPrefixes === undefined ? {} : { allowedPathPrefixes }),
                ...(allowedTools === undefined ? {} : { allowedTools }),
                ...reconciled.credentialUpdate,
                ...(hookColumns ?? {})
              },
              tx
            )
          : locked;

        // A saved value goes only when it no longer applies: a new credential type drops every one, and a field the
        // admin takes back drops that field's. A field members still provide keeps what they saved. The update above
        // wrote the service row, which is what a personal values save waits on.
        let personalValuesCleared = false;
        const toClear = personalValuesToClearOf({
          credentialTypeChanged,
          memberFieldsChanged,
          nextMemberFields,
          oauthMembersRebound
        });
        if (toClear === "all") {
          const deleted = await agentVaultPersonalValueDAL.delete({ serviceId: service.id }, tx);
          personalValuesCleared = deleted.length > 0;
        } else if (toClear === "fields-taken-back") {
          const deletedCount = await agentVaultPersonalValueDAL.deleteForServiceExceptFields(
            { serviceId: service.id, keepFields: nextMemberFields! },
            tx
          );
          personalValuesCleared = deletedCount > 0;
        }

        // Outside the lock, two concurrent PATCHes both pass the ownership check and the loser's writes no-op.
        const applyDiff = async <TRow extends { id: string; encryptedValue?: Buffer | null }, TColumns>(
          dal: {
            findByServiceIds: (ids: string[], tx?: Knex) => Promise<TRow[]>;
            insertMany: (rows: never[], tx?: Knex) => Promise<TRow[]>;
            updateById: (id: string, columns: never, tx?: Knex) => Promise<TRow>;
            delete: (filter: never, tx?: Knex) => Promise<TRow[]>;
          },
          incoming: TTransformationWrite<TColumns>[] | undefined,
          naturalKeyOfRow: (row: TRow) => string,
          subject: string
        ): Promise<TRow[]> => {
          const existing = await dal.findByServiceIds([service.id], tx);
          if (!incoming) return existing;

          const plan = planTransformationDiff({ existing, incoming, naturalKeyOfRow, subject });

          // Sequential: these share the transaction's single connection, and the schema caps the list at 20.
          // eslint-disable-next-line no-restricted-syntax
          for (const update of plan.updates) {
            // eslint-disable-next-line no-await-in-loop
            await dal.updateById(update.id, update.columns as never, tx);
          }
          if (plan.deleteIds.length) await dal.delete({ $in: { id: plan.deleteIds } } as never, tx);

          const created = plan.creates.length
            ? await dal.insertMany(plan.creates.map((row) => ({ ...row, serviceId: service.id })) as never[], tx)
            : [];

          const updatedById = new Map(plan.updates.map((update) => [update.id, update.columns]));
          const survivors = existing
            .filter((row) => !plan.deleteIds.includes(row.id))
            .map((row) => ({ ...row, ...(updatedById.get(row.id) ?? {}) }) as TRow);

          return [...survivors, ...created].sort(
            (a, b) => (a as unknown as { position: number }).position - (b as unknown as { position: number }).position
          );
        };

        const updatedCustomHeaders = await applyDiff(
          agentVaultServiceCustomHeaderDAL,
          customHeaderWrites,
          (row) => row.name.toLowerCase(),
          "custom header"
        );
        const updatedSubstitutions = await applyDiff(
          agentVaultServiceSubstitutionDAL,
          substitutionWrites,
          (row) => row.placeholder,
          "substitution"
        );

        // Every value this save sealed has its rows rebuilt from what it sealed: the whole secret when it was
        // rewritten, since a kept half is sealed again with it. A row's position is its index in the list just
        // written, which is how a value finds its row, and a row dropped from the list takes its references
        // with it through the foreign key.
        const rewrittenCustomHeaders = updatedCustomHeaders.flatMap((row) => {
          const storedValue = storedCustomHeaderValues[row.position];
          return storedValue === undefined ? [] : [{ id: row.id, storedValue }];
        });
        const rewrittenSubstitutions = updatedSubstitutions.flatMap((row) => {
          const storedValue = storedSubstitutionValues[row.position];
          return storedValue === undefined ? [] : [{ id: row.id, storedValue }];
        });

        if (writtenSecret !== undefined) {
          await agentVaultServiceVariableReferenceDAL.delete(
            {
              serviceId: service.id,
              $in: {
                field: [
                  AgentVaultVariableReferenceField.CredentialValue,
                  AgentVaultVariableReferenceField.CredentialUsername
                ]
              }
            },
            tx
          );
        }
        if (rewrittenCustomHeaders.length) {
          await agentVaultServiceVariableReferenceDAL.delete(
            { $in: { customHeaderId: rewrittenCustomHeaders.map((row) => row.id) } },
            tx
          );
        }
        if (rewrittenSubstitutions.length) {
          await agentVaultServiceVariableReferenceDAL.delete(
            { $in: { substitutionId: rewrittenSubstitutions.map((row) => row.id) } },
            tx
          );
        }
        const referenceRows = [
          ...(writtenSecret === undefined ? [] : credentialReferenceRowsOf(service.id, writtenSecret, variableIds)),
          ...rewrittenCustomHeaders.flatMap(({ id, storedValue }) =>
            referenceRowsOf(
              service.id,
              { field: AgentVaultVariableReferenceField.CustomHeader, customHeaderId: id },
              storedValue,
              variableIds
            )
          ),
          ...rewrittenSubstitutions.flatMap(({ id, storedValue }) =>
            referenceRowsOf(
              service.id,
              { field: AgentVaultVariableReferenceField.Substitution, substitutionId: id },
              storedValue,
              variableIds
            )
          )
        ];
        await insertReferenceRows(rest.projectId, referenceRows, tx);
        const variableReferences = await agentVaultServiceVariableReferenceDAL.findByServiceIds([service.id], tx);

        return {
          updatedService,
          updatedCustomHeaders,
          updatedSubstitutions,
          variableReferences,
          personalValuesCleared,
          tlsCaChanged,
          hookAudit
        };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      await oauth?.claim.restore();
      if (isUniqueViolation(err)) {
        throw serviceNameTaken(name ?? service.name);
      }
      if (
        hasPostgresConstraintViolation(
          err,
          DatabaseErrorCode.ForeignKeyViolation,
          VARIABLE_REFERENCE_VARIABLE_FOREIGN_KEY
        )
      ) {
        throw new BadRequestError({ message: VARIABLE_DELETED_DURING_SAVE_MESSAGE });
      }
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
      }
      throw err;
    }

    return {
      service: {
        ...projectService(
          result.updatedService as TAgentVaultCatalogService,
          result.updatedCustomHeaders,
          result.updatedSubstitutions,
          result.variableReferences
        ),
        accessBundles: await bundlesOf()
      },
      update: {
        hostPattern: requestedHostPattern,
        serverUrl,
        transport,
        host,
        port,
        database,
        tlsEnabled: tls?.enabled,
        tlsVerify: tls?.verify,
        tlsCaChanged: result.tlsCaChanged,
        allowedMethods,
        allowedPathPrefixes,
        allowedTools,
        customHeaders,
        substitutions,
        ...result.hookAudit
      },
      credentialReplaced,
      personalValuesCleared: result.personalValuesCleared
    };
  };

  // Unaudited: it changes nothing, and the save that follows is audited.
  const listMcpTools = async ({
    serviceId,
    serverUrl,
    transport,
    credential,
    customHeaders,
    ...rest
  }: TListMcpToolsDTO) => {
    await requireServiceWrite(rest);
    assertOauthConnectedByUser(rest.ctx, credential);
    if (credential) assertCredentialTypeSupported(getAgentVaultServiceType(AgentVaultServiceType.Mcp), credential.type);

    const service = serviceId
      ? await agentVaultServiceDAL.findByIdInProject({ id: serviceId, projectId: rest.projectId })
      : undefined;
    if (serviceId && !service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
    if (service && service.type !== AgentVaultServiceType.Mcp) {
      throw new BadRequestError({ message: `The service '${service.name}' isn't an MCP service, so it has no tools.` });
    }

    const { decryptor } = await getProjectCipher(rest.projectId);
    // Only an inline service's values are ever deleted, and this reads a project's services.
    const openValue = (sealed: Buffer | null | undefined) => {
      if (!sealed) throw new BadRequestError({ message: "Save the service's values again, then load the tools." });
      return (JSON.parse(decryptor({ cipherTextBlob: sealed }).toString("utf-8")) as { value: string }).value;
    };
    const withPrefix = (prefix: string | undefined, value: string) => (prefix ? `${prefix} ${value}` : value);
    const noAdminTokenError = () =>
      new BadRequestError({
        message: "Each member sets this service's token, so Infisical has no token to load its tools with."
      });

    // Typed values name variables by key and stored ones by id, so typed ones are stored first and every value is
    // filled in the way resolve fills it in.
    const { idOfKey } = await loadProjectVariables(rest.projectId, [
      ...(credential ? credentialReferenceTexts(credential) : []),
      ...(customHeaders ?? []).flatMap((header) =>
        header.value === undefined ? [] : [{ label: `The custom header '${header.name}'`, text: header.value }]
      )
    ]);
    const store = (text: string) => toStoredVariableReferences(text, idOfKey);

    // An OAuth token is issued by the provider, never typed, so like resolve this never expands one.
    let credentialHeader: { name: string; prefix?: string; value: string; isTyped: boolean };
    // Set when the token is the service's saved OAuth token, which can be refreshed if the server refuses it.
    let refreshSavedToken: ((rejectedTokenHash: string) => Promise<string>) | undefined;
    const credentialType = credential?.type ?? (service?.credentialType as AgentVaultCredentialType | undefined);
    if (credentialType === AgentVaultCredentialType.OAuth) {
      const memberSignIn =
        credential?.type === AgentVaultCredentialType.OAuth
          ? Boolean(memberFieldsOf(credential)) ||
            (!credential.authorizationId && Boolean(service && isMemberProvidedOauth(service)))
          : Boolean(service && isMemberProvidedOauth(service));
      if (memberSignIn) {
        throw new BadRequestError({
          message: "Each member signs in to this service, so Infisical has no connection to load its tools with."
        });
      }
      let accessToken: string;
      if (credential?.type === AgentVaultCredentialType.OAuth && credential.authorizationId) {
        accessToken = await agentVaultOauthService.readAuthorizationAccessToken({
          authorizationId: credential.authorizationId,
          projectId: rest.projectId,
          serviceId: service?.id,
          ctx: rest.ctx,
          serverUrl
        });
      } else {
        if (service?.credentialType !== AgentVaultCredentialType.OAuth) {
          throw new BadRequestError({ message: "Authorize the service, then load the tools." });
        }
        const storedServerUrl = getServiceServerUrl(service.config);
        // The stored tokens only ever go to the server they were authorized for.
        if (serverUrl !== storedServerUrl)
          throw new BadRequestError({ message: OAUTH_SERVER_URL_NEEDS_AUTHORIZATION_MESSAGE });
        const savedService = service!;
        const refreshToken = async (rejectedTokenHash?: string) => {
          const refreshed = await agentVaultOauthService.refreshServiceToken({
            serviceId: savedService.id,
            projectId: rest.projectId,
            expiresWithinSeconds: 60,
            rejectedTokenHash,
            destination: { hostPattern: savedService.hostPattern ?? null, serverUrl: storedServerUrl }
          });
          if (refreshed.status === AgentVaultOauthStatus.NeedsReauthorization) {
            throw new BadRequestError({
              message:
                "This service's sign-in is no longer accepted. Reauthorize the service, then load the tools again."
            });
          }
          return refreshed.credential.value;
        };
        accessToken = await refreshToken();
        refreshSavedToken = refreshToken;
      }
      credentialHeader = {
        name: AGENT_VAULT_OAUTH_HEADER_NAME,
        prefix: AGENT_VAULT_OAUTH_HEADER_PREFIX,
        value: accessToken,
        isTyped: false
      };
    } else if (credentialType === AgentVaultCredentialType.Bearer) {
      const stored = service?.credentialType === AgentVaultCredentialType.Bearer ? service : undefined;
      let write: TCredentialWrite;
      if (!credential)
        write = {
          config: stored!.credentialConfig as TAgentVaultCredentialConfig,
          secret: undefined,
          memberProvidedFields: stored!.memberProvidedFields as TAgentVaultMemberProvidedField[] | null
        };
      else if (service) write = mergeCredential(storeCredentialReferences(credential, store), service, null);
      else write = splitCredential(storeCredentialReferences(credential, store));
      if (write.memberProvidedFields?.length) throw noAdminTokenError();

      const config = write.config as Extract<TAgentVaultCredentialConfig, { type: AgentVaultCredentialType.Bearer }>;
      const value =
        write.secret?.value ?? (stored?.encryptedCredential ? openValue(stored.encryptedCredential) : undefined);
      if (value === undefined) throw noAdminTokenError();
      credentialHeader = { name: config.headerName, prefix: config.headerPrefix, value, isTyped: true };
    } else {
      throw new BadRequestError({ message: "Add the service's credential, then load the tools." });
    }

    const storedCustomHeaders = service ? await agentVaultServiceCustomHeaderDAL.findByServiceIds([service.id]) : [];
    // Matched the way a save matches them, so the tools load with exactly the headers that save would store.
    const matchedHeaders = customHeaders
      ? matchTransformationRows({
          existing: storedCustomHeaders,
          incoming: customHeaders.map((header) => ({ id: header.id, naturalKey: header.name.toLowerCase() })),
          naturalKeyOfRow: (row) => row.name.toLowerCase(),
          subject: "custom header"
        })
      : storedCustomHeaders;
    const headerSource: (TAgentVaultCustomHeaderUpdate | TAgentVaultServiceCustomHeaders)[] =
      customHeaders ?? storedCustomHeaders;
    const headerTexts = headerSource.map((header, index) => {
      if ("value" in header && header.value !== undefined)
        return { name: header.name, prefix: header.prefix, text: store(header.value) };
      const match = matchedHeaders[index];
      if (!match) {
        throw new BadRequestError({
          message: `Enter a value for the custom header '${header.name}', then load the tools.`
        });
      }
      return { name: header.name, prefix: header.prefix, text: openValue(match.encryptedValue) };
    });
    assertCustomHeadersDoNotShadowCredential({ type: credentialType, headerName: credentialHeader.name }, headerTexts);
    // A rejection only blames the saved token when nothing else in the request differs from what is saved: a wrong
    // typed header must not refresh the token, or mark the saved service as needing reauthorization.
    const isSavedConnection =
      service !== undefined &&
      transport === (service.config as TAgentVaultServiceConfig | null)?.transport &&
      (!customHeaders ||
        (customHeaders.length === storedCustomHeaders.length &&
          customHeaders.every((header, index) => {
            const match = matchedHeaders[index];
            return (
              header.value === undefined &&
              match !== undefined &&
              header.name.toLowerCase() === match.name.toLowerCase() &&
              (header.prefix ?? "") === match.prefix
            );
          })));

    const texts = [
      ...(credentialHeader.isTyped ? [credentialHeader.value] : []),
      ...headerTexts.map((header) => header.text)
    ];
    const variableIds = [...new Set(texts.flatMap(findStoredVariableIds))];
    const variableValues = new Map(
      (await agentVaultVariableDAL.findValuesForResolve({ variableIds, projectId: rest.projectId, owner: null })).map(
        (row) => [row.id, openValue(row.encryptedValue)]
      )
    );
    const expand = (text: string) => expandStoredVariableReferences(text, (id) => variableValues.get(id));

    const headerValues = headerTexts.map((header) => ({ ...header, value: expand(header.text) }));
    const credentialValue = credentialHeader.isTyped ? expand(credentialHeader.value) : credentialHeader.value;
    const listWith = (token: string) =>
      listMcpServerTools({
        serverUrl,
        transport,
        headers: {
          ...Object.fromEntries(headerValues.map((header) => [header.name, withPrefix(header.prefix, header.value)])),
          [credentialHeader.name]: withPrefix(credentialHeader.prefix, token)
        },
        secrets: [token, ...headerValues.map((header) => header.value)]
      });
    try {
      return { tools: await listWith(credentialValue) };
    } catch (err) {
      // A saved token can be refused before it expires (revoked, or no expiry from the provider), so it is refreshed
      // once, as the proxy does, before the admin is asked to reauthorize.
      if (!(err instanceof McpListError && err.isCredentialRejected) || !refreshSavedToken || !isSavedConnection)
        throw err;
      const refreshedToken = await refreshSavedToken(hashAccessToken(credentialValue));
      if (refreshedToken === credentialValue) throw err;
      return { tools: await listWith(refreshedToken) };
    }
  };

  // Deleting a service takes its links, its members' values and its child rows with it, through the cascade.
  const deleteService = async ({ serviceId, ...rest }: TDeleteServiceDTO) => {
    await requireServiceWrite(rest);

    const service = await agentVaultServiceDAL.findByIdInProject({ id: serviceId, projectId: rest.projectId });
    if (!service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });

    // Read before the delete, since CASCADE takes these rows with the service.
    const [{ customHeaders, substitutions, variableReferences }, bundlesByService] = await Promise.all([
      loadTransformations([service.id]),
      agentVaultServiceDAL.findBundlesForServices([service.id], null)
    ]);
    const deleted = await agentVaultServiceDAL.deleteById(service.id);
    return {
      service: {
        ...projectService(deleted as TAgentVaultCatalogService, customHeaders, substitutions, variableReferences),
        accessBundles: bundlesByService.get(service.id) ?? []
      }
    };
  };

  // The services the caller can see, each with the bundles they reach it through and their own setup status. A member
  // sees a service only while a bundle they reach holds it.
  // personalValues describe the owner's values: the caller's, or the user a session on their behalf would be for.
  const $viewServices = async (
    {
      projectId,
      ctx,
      owner = ownerOrNullOf(ctx)
    }: { projectId: string; ctx: TGetAccessBundleDTO["ctx"]; owner?: ReturnType<typeof ownerOrNullOf> },
    services: TAgentVaultCatalogService[],
    accessBundleIds: string[] | null,
    visibility: ReturnType<typeof serviceVisibilityOf>
  ) => {
    const serviceIds = services.map((service) => service.id);
    const [transformations, bundlesByService, statuses] = await Promise.all([
      loadTransformations(serviceIds, undefined, { withVariableReferences: visibility.canReadVariables }),
      agentVaultServiceDAL.findBundlesForServices(serviceIds, accessBundleIds),
      owner && serviceIds.length
        ? agentVaultPersonalValueService.findStatusesForOwner({
            projectId,
            owner,
            accessBundleIds,
            includeUnlinked: true
          })
        : []
    ]);
    return services.map((service) => ({
      ...viewService(service, transformations, {
        ...visibility,
        status: statuses.find((entry) => entry.serviceId === service.id)
      }),
      accessBundles: bundlesByService.get(service.id) ?? []
    }));
  };

  const $readServicesAccess = async (dto: { projectId: string; ctx: TGetAccessBundleDTO["ctx"] }) => {
    const { permission, accessBundleIds, grantedAccessBundleIds } = await getAgentVaultGrantedReachability(
      { permissionService, membershipDAL },
      dto
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return { accessBundleIds, grantedAccessBundleIds, visibility: serviceVisibilityOf(permission) };
  };

  // The list a member sets up their personal values from, so it can be narrowed to what still needs them. Setup is
  // counted over the same bundles the list is scoped to, the way the bundle list counts it. On a user's behalf it lists
  // the services a session for them could name, scoped like the bundle list's on-behalf-of mode and set up with the
  // user's personal values.
  const listServices = async ({ projectId, ctx, requiresSetup, granted, onBehalfOf, ...page }: TListServicesDTO) => {
    const { accessBundleIds, grantedAccessBundleIds, visibility } = await $readServicesAccess({ projectId, ctx });
    const { scopeIds: scopeBundleIds, owner } = onBehalfOf
      ? await $onBehalfOfListScope({ projectId, ctx, onBehalfOf, callerAccessBundleIds: accessBundleIds })
      : { scopeIds: granted ? grantedAccessBundleIds : accessBundleIds, owner: ownerOrNullOf(ctx) };
    let serviceIds = await serviceIdsReachedThrough(agentVaultServiceDAL, scopeBundleIds);
    let excludeServiceIds: string[] = [];

    if (requiresSetup !== undefined) {
      const statuses = owner
        ? await agentVaultPersonalValueService.findStatusesForOwner({
            projectId,
            owner,
            accessBundleIds: scopeBundleIds,
            includeUnlinked: true,
            withVariableReferences: false
          })
        : [];
      const pendingIds = [
        ...new Set(statuses.filter((status) => !status.isConfigured).map((status) => status.serviceId))
      ];
      if (requiresSetup) serviceIds = serviceIds ? serviceIds.filter((id) => pendingIds.includes(id)) : pendingIds;
      else excludeServiceIds = pendingIds;
    }

    const { services, totalCount } = await agentVaultServiceDAL.findForList({
      projectId,
      serviceIds,
      excludeServiceIds,
      ...page
    });
    return {
      services: await $viewServices(
        { projectId, ctx, owner },
        services,
        onBehalfOf ? scopeBundleIds : accessBundleIds,
        visibility
      ),
      totalCount
    };
  };

  const getService = async ({ projectId, ctx, serviceId }: TServiceByIdDTO) => {
    const { accessBundleIds, visibility } = await $readServicesAccess({ projectId, ctx });
    const service = await agentVaultServiceDAL.findByIdInProject({ id: serviceId, projectId });
    const [view] = service ? await $viewServices({ projectId, ctx }, [service], accessBundleIds, visibility) : [];
    // A service no bundle the caller reaches holds reads like one that doesn't exist.
    if (!view || (accessBundleIds && !view.accessBundles.length)) {
      throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
    }
    return { service: view };
  };

  // All or nothing: one service that's missing or conflicts stops the rest. Services already in the bundle are skipped.
  const addServicesToBundle = async ({ accessBundleId, serviceIds, ...rest }: TAddBundleServicesDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    const requestedIds = [...new Set(serviceIds.map((id) => id.toLowerCase()))];

    const add = () =>
      agentVaultServiceDAL.transaction(async (tx) => {
        await lockServiceNames(rest.projectId, tx);
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        // Locked in ID order, so two requests naming the same services can't each hold one the other needs.
        const lockedById = new Map<string, TAgentVaultCatalogService>();
        for (const id of [...requestedIds].sort()) {
          // eslint-disable-next-line no-await-in-loop
          const service = await agentVaultServiceDAL.lockByIdInProject({ id, projectId: rest.projectId }, tx);
          if (!service) throw new NotFoundError({ message: `Service with ID '${id}' not found` });
          lockedById.set(id, service);
        }

        const added: TAgentVaultCatalogService[] = [];
        const skipped: { id: string; name: string }[] = [];
        for (const id of requestedIds) {
          const service = lockedById.get(id) as TAgentVaultCatalogService;
          // eslint-disable-next-line no-await-in-loop
          if (await agentVaultServiceDAL.findLink({ accessBundleId: bundle.id, serviceId: service.id }, tx)) {
            skipped.push({ id: service.id, name: service.name });
            // eslint-disable-next-line no-continue
            continue;
          }
          // Each link goes in before the next check, so two picked services for the same host conflict with each other.
          // eslint-disable-next-line no-await-in-loop
          await checkHostPatternConflicts(
            {
              accessBundles: [bundle],
              hostPattern: service.hostPattern ?? null,
              excludeServiceId: service.id,
              addingName: requestedIds.length > 1 ? service.name : undefined
            },
            tx
          );
          // eslint-disable-next-line no-await-in-loop
          await agentVaultServiceDAL.insertLinks([{ accessBundleId: bundle.id, serviceId: service.id }], tx);
          added.push(service);
        }
        return { added, skipped };
      });

    let result: Awaited<ReturnType<typeof add>>;
    try {
      result = await add();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError({
          message: "One of these services was added to this access bundle at the same time. Try again."
        });
      }
      throw err;
    }
    const services = result.added.length
      ? await $viewServices(rest, result.added, null, serviceVisibilityOf(permission))
      : [];
    return { services, skipped: result.skipped, accessBundle: { id: bundle.id, name: bundle.name } };
  };

  // The service stays in the project. Whoever reached it only through this bundle loses what they saved for it.
  const removeServiceFromBundle = async ({ accessBundleId, serviceId, ...rest }: TBundleServiceDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    // Bundle, then service, the order every path takes them, and the service row is what a personal values save holds,
    // so a save in flight either commits first and is cleared below, or waits and then finds the link gone.
    const service = await agentVaultServiceDAL.transaction(async (tx) => {
      await lockServiceNames(rest.projectId, tx);
      const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
        { id: bundle.id, projectId: rest.projectId },
        tx
      );
      if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });
      const row = await agentVaultServiceDAL.lockByIdInProject({ id: serviceId, projectId: rest.projectId }, tx);
      const removed = row
        ? await agentVaultServiceDAL.deleteLink({ accessBundleId: bundle.id, serviceId: row.id }, tx)
        : 0;
      if (!row || !removed) {
        throw new NotFoundError({
          message: `Service with ID '${serviceId}' is not in the access bundle '${bundle.name}'`
        });
      }
      await agentVaultServiceDAL.clearLegacyAccessBundle({ accessBundleId: bundle.id, serviceId: row.id }, tx);
      await clearPersonalValuesAfterRevoke(
        { agentVaultPersonalValueDAL, userGroupMembershipDAL, identityGroupMembershipDAL },
        { projectId: rest.projectId, serviceIds: [row.id], everyActor: true },
        tx
      );
      return row;
    });

    const [view] = await $viewServices(rest, [service], null, serviceVisibilityOf(permission));
    return { service: view, accessBundle: { id: bundle.id, name: bundle.name } };
  };

  const listMembers = async ({ accessBundleId, actorType, search, limit, offset, ...rest }: TListMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return agentVaultAccessBundleDAL.findMembers({
      projectId: rest.projectId,
      orgId: rest.ctx.actorOrgId,
      accessBundleId: bundle.id,
      actorType,
      search,
      limit,
      offset
    });
  };

  // The candidates for a grant are the product's own members, since addMembers refuses anyone else, minus
  // whoever already holds this bundle. A member reaching it only through a granted group stays a
  // candidate: an individual grant is a different thing, and it outlives the group membership.
  const listAvailableMembers = async ({
    accessBundleId,
    actorType,
    search,
    limit,
    offset,
    ...rest
  }: TListMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return agentVaultMemberDAL.findProductMembers({
      projectId: rest.projectId,
      orgId: rest.ctx.actorOrgId,
      actorTypes: actorType ? [actorType] : ALL_GRANTEE_ACTOR_TYPES,
      search,
      limit,
      offset,
      excludeAccessBundleId: bundle.id
    });
  };

  const addMembers = async ({ accessBundleId, userIds, groupIds, machineIdentityIds, ...rest }: TAddMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const requested = new Map<string, TGrantActor>();
    const byColumn: [TGrantActorColumn, string[]][] = [
      ["actorUserId", userIds],
      ["actorGroupId", groupIds],
      ["actorIdentityId", machineIdentityIds]
    ];
    byColumn.forEach(([actorColumn, ids]) => {
      ids.forEach((actorId) => {
        const actor = { actorColumn, actorId };
        requested.set(actorKey(actor), actor);
      });
    });

    const actors = [...requested.values()];
    await assertActorsInProject({ projectId: rest.projectId, actors });
    const nameByKey = await resolveActorNames(actors);

    // The bundle row lock serializes grants for this bundle, so reading the existing ones inside it is
    // enough to dedupe. The unique index per actor per bundle stays as the backstop, and its violation
    // has to be caught outside the transaction.
    const grant = () =>
      membershipDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        const existing = await membershipDAL.find(bundleScope(rest.projectId, bundle.id), { tx });
        const alreadyGranted = new Set(
          existing.flatMap((row) => {
            if (row.actorUserId) return [actorKey({ actorColumn: "actorUserId", actorId: row.actorUserId })];
            if (row.actorIdentityId)
              return [actorKey({ actorColumn: "actorIdentityId", actorId: row.actorIdentityId })];
            if (row.actorGroupId) return [actorKey({ actorColumn: "actorGroupId", actorId: row.actorGroupId })];
            return [];
          })
        );

        const skipped = actors.filter((actor) => alreadyGranted.has(actorKey(actor))).map(toActorRefFromGrant);
        const toGrant = actors.filter((actor) => !alreadyGranted.has(actorKey(actor)));
        if (!toGrant.length) return { created: [] as TMemberships[], skipped };

        const created = await writeGrants(
          { projectId: rest.projectId, orgId: rest.ctx.actorOrgId, accessBundleId: bundle.id, actors: toGrant },
          tx
        );
        return { created, skipped };
      });

    let outcome: { created: TMemberships[]; skipped: TAgentVaultAccessBundleActorRef[] };
    try {
      outcome = await grant();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: "That user, machine identity, or group already has this access bundle" });
      }
      throw err;
    }

    return {
      members: withActorNames(outcome.created.map(toMember), nameByKey),
      skipped: outcome.skipped,
      accessBundleName: bundle.name
    };
  };

  const revokeMembers = async ({
    accessBundleId,
    userIds,
    groupIds,
    machineIdentityIds,
    ...rest
  }: TRevokeMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const requested = new Map<string, TGrantActor>();
    const byColumn: [TGrantActorColumn, string[]][] = [
      ["actorUserId", userIds],
      ["actorGroupId", groupIds],
      ["actorIdentityId", machineIdentityIds]
    ];
    byColumn.forEach(([actorColumn, ids]) => {
      ids.forEach((actorId) => requested.set(actorKey({ actorColumn, actorId }), { actorColumn, actorId }));
    });
    const actors = [...requested.values()];
    const nameByKey = await resolveActorNames(actors);

    // The same row lock the grant path takes, so a revoke cannot race a grant or a bundle delete.
    const outcome = await membershipDAL.transaction(async (tx) => {
      const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
        { id: bundle.id, projectId: rest.projectId },
        tx
      );
      if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

      const heldByKey = new Map<string, TMemberships>();
      await Promise.all(
        byColumn.map(async ([actorColumn, ids]) => {
          if (!ids.length) return;
          const rows = await membershipDAL.find(
            { ...bundleScope(rest.projectId, bundle.id), $in: { [actorColumn]: ids } },
            { tx }
          );
          rows.forEach((row) => {
            const actorId = row[actorColumn];
            if (actorId) heldByKey.set(actorKey({ actorColumn, actorId }), row);
          });
        })
      );

      const skipped = actors.filter((actor) => !heldByKey.has(actorKey(actor))).map(toActorRefFromGrant);
      const held = actors.filter((actor) => heldByKey.has(actorKey(actor)));
      if (!held.length) return { removed: [] as TMemberships[], skipped };

      const rows = held.map((actor) => heldByKey.get(actorKey(actor))!);
      await membershipDAL.delete({ $in: { id: rows.map((row) => row.id) } }, tx);
      await clearPersonalValuesAfterRevoke(
        { agentVaultPersonalValueDAL, userGroupMembershipDAL, identityGroupMembershipDAL },
        {
          projectId: rest.projectId,
          accessBundleId: bundle.id,
          userIds: rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])),
          identityIds: rows.flatMap((row) => (row.actorIdentityId ? [row.actorIdentityId] : [])),
          groupIds: rows.flatMap((row) => (row.actorGroupId ? [row.actorGroupId] : []))
        },
        tx
      );
      return { removed: rows, skipped };
    });

    return {
      members: withActorNames(outcome.removed.map(toActorRef), nameByKey),
      skipped: outcome.skipped,
      accessBundleName: bundle.name
    };
  };

  return {
    listAccessBundles,
    getAccessBundleById,
    createAccessBundle,
    updateAccessBundle,
    deleteAccessBundle,
    listServices,
    getService,
    createService,
    updateService,
    listMcpTools,
    deleteService,
    addServicesToBundle,
    removeServiceFromBundle,
    listMembers,
    listAvailableMembers,
    addMembers,
    revokeMembers
  };
};
