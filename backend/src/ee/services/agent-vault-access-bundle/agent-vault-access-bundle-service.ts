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
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { hasPostgresConstraintViolation, hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { shake } from "@app/lib/fn";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

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
  AgentVaultHttpMethod,
  AgentVaultMemberType,
  AgentVaultResourceRole,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "../agent-vault/agent-vault-enums";
import { ownerOrNullOf } from "../agent-vault/agent-vault-owner-fns";
import { getAgentVaultGrantedReachability, getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import {
  assertCredentialTypeSupported,
  assertServiceFieldsSupported,
  buildServiceConfig,
  dropReadBackServiceFields,
  getAgentVaultServiceType,
  getServiceServerUrl,
  resolveServiceHostPattern,
  TAgentVaultServiceConfig
} from "../agent-vault/agent-vault-service-type-fns";
import {
  findStoredVariableIds,
  findVariableKeys,
  toStoredVariableReferences,
  toVariableReference
} from "../agent-vault/agent-vault-variable-fns";
import { TAgentVaultMemberDALFactory } from "../agent-vault-member/agent-vault-member-dal";
import {
  checkOauthClaimUnderLock,
  checkOauthServerUnderLock,
  OAUTH_SERVER_URL_NEEDS_AUTHORIZATION_MESSAGE,
  TAgentVaultOauthServiceFactory
} from "../agent-vault-oauth/agent-vault-oauth-service";
import { AGENT_VAULT_OAUTH_HEADER_NAME, TAgentVaultOauthConfig } from "../agent-vault-oauth/agent-vault-oauth-types";
import { TAgentVaultPersonalValueDALFactory } from "../agent-vault-personal-value/agent-vault-personal-value-dal";
import {
  clearPersonalValuesAfterRevoke,
  sameMemberProvidedFields
} from "../agent-vault-personal-value/agent-vault-personal-value-fns";
import { TAgentVaultPersonalValueServiceFactory } from "../agent-vault-personal-value/agent-vault-personal-value-service";
import { TAgentVaultVariableDALFactory } from "../agent-vault-variable/agent-vault-variable-dal";
import {
  TAgentVaultAccessBundleActorRef,
  TAgentVaultAccessBundleDALFactory,
  TAgentVaultAccessBundleListRow
} from "./agent-vault-access-bundle-dal";
import {
  TAddMembersDTO,
  TAgentVaultBasicMemberField,
  TAgentVaultBearerMemberField,
  TAgentVaultCredentialSummary,
  TAgentVaultCredentialUpdate,
  TAgentVaultVariableReferenceSummary,
  TCreateAccessBundleDTO,
  TCreateServiceDTO,
  TDeleteAccessBundleDTO,
  TDeleteServiceDTO,
  TGetAccessBundleDTO,
  TListAccessBundlesDTO,
  TListMembersDTO,
  TRevokeMembersDTO,
  TUpdateAccessBundleDTO,
  TUpdateServiceDTO
} from "./agent-vault-access-bundle-types";
import {
  isStoredSecretReplaced,
  mergeCredential,
  needsStoredSecretFor,
  nextMemberFieldsOf,
  splitCredential,
  TCredentialWrite
} from "./agent-vault-credential-write-fns";
import { TAgentVaultServiceCustomHeaderDALFactory } from "./agent-vault-service-custom-header-dal";
import { TAgentVaultServiceDALFactory } from "./agent-vault-service-dal";
import { TAgentVaultServiceSubstitutionDALFactory } from "./agent-vault-service-substitution-dal";
import {
  TAgentVaultServiceVariableReferenceDALFactory,
  TAgentVaultVariableReferenceWithKey
} from "./agent-vault-service-variable-reference-dal";
import { planTransformationDiff, TTransformationWrite } from "./agent-vault-transformation-fns";

type TAgentVaultAccessBundleServiceFactoryDep = {
  agentVaultAccessBundleDAL: TAgentVaultAccessBundleDALFactory;
  agentVaultServiceDAL: TAgentVaultServiceDALFactory;
  agentVaultServiceCustomHeaderDAL: TAgentVaultServiceCustomHeaderDALFactory;
  agentVaultServiceSubstitutionDAL: TAgentVaultServiceSubstitutionDALFactory;
  agentVaultVariableDAL: Pick<TAgentVaultVariableDALFactory, "findKeys" | "lockForReference">;
  agentVaultServiceVariableReferenceDAL: TAgentVaultServiceVariableReferenceDALFactory;
  agentVaultPersonalValueDAL: Pick<
    TAgentVaultPersonalValueDALFactory,
    "delete" | "deleteForServiceExceptFields" | "deleteForActorsWithoutGrant"
  >;
  agentVaultPersonalValueService: Pick<TAgentVaultPersonalValueServiceFactory, "findStatusesForOwner">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  membershipDAL: Pick<
    TMembershipDALFactory,
    "findOne" | "find" | "insertMany" | "delete" | "deleteById" | "transaction" | "findResourceMembershipsForActor"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany">;
  agentVaultMemberDAL: Pick<TAgentVaultMemberDALFactory, "findProductMembers">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
  agentVaultOauthService: Pick<
    TAgentVaultOauthServiceFactory,
    "claimAuthorization" | "buildCredentialFromAuthorization"
  >;
} & TAgentVaultActorNameDALs;

export type TAgentVaultAccessBundleServiceFactory = ReturnType<typeof agentVaultAccessBundleServiceFactory>;

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
    membershipDAL,
    membershipRoleDAL,
    agentVaultMemberDAL,
    userGroupMembershipDAL,
    identityGroupMembershipDAL,
    agentVaultOauthService,
    userDAL,
    groupDAL,
    identityDAL
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
        message: `The ${actor} is in Agent Vault through a group. Grant the access bundle to the group, or add them directly under Access Control first.`
      });
    }

    throw new BadRequestError({
      message: `The ${actor} is not a member of Agent Vault. Add them under Access Control first.`
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
      // Nothing secret and nothing that identifies the token: no client, no token hash.
      case AgentVaultCredentialType.OAuth: {
        const oauth = service.credentialConfig as TAgentVaultOauthConfig;
        return {
          type: AgentVaultCredentialType.OAuth,
          status: oauth.status,
          issuer: oauth.issuer,
          grantedScopes: oauth.grantedScopes ?? [],
          requiredScopes: oauth.requiredScopes ?? [],
          expiresAt: oauth.expiresAt ?? null,
          authorizedAt: oauth.authorizedAt ?? null,
          lastError: oauth.lastError ?? null
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

  // Built by hand rather than spread, so the sealed columns stay off the wire even if the response schema is
  // later loosened.
  const projectService = (
    service: TAgentVaultServices,
    customHeaders: TAgentVaultServiceCustomHeaders[],
    substitutions: TAgentVaultServiceSubstitutions[],
    variableReferences: TAgentVaultVariableReferenceWithKey[]
  ) => {
    const config = (service.config ?? {}) as TAgentVaultServiceConfig;
    return {
      id: service.id,
      accessBundleId: service.accessBundleId,
      name: service.name,
      type: service.type as AgentVaultServiceType,
      // Flat, like the create and update bodies, so a client can send back what it read (all but the credential, whose
      // secret is never returned). Null for an http service.
      serverUrl: config.serverUrl ?? null,
      transport: config.transport ?? null,
      hostPattern: service.hostPattern,
      allowedMethods: (service.allowedMethods ?? null) as AgentVaultHttpMethod[] | null,
      allowedPathPrefixes: service.allowedPathPrefixes ?? null,
      credential: summarizeCredential(service),
      customHeaders: customHeaders.map((header) => ({ id: header.id, name: header.name, prefix: header.prefix })),
      substitutions: substitutions.map((substitution) => ({
        id: substitution.id,
        placeholder: substitution.placeholder,
        surfaces: substitution.surfaces as AgentVaultSubstitutionSurface[]
      })),
      variableReferences: variableReferences.map(summarizeVariableReference),
      createdAt: service.createdAt,
      updatedAt: service.updatedAt
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
    Object.entries(storedSecret ?? {}).flatMap(([part, text]) =>
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

  // Basic and OAuth have no header name in their config, but the proxy always writes Authorization for both.
  const credentialHeaderName = (credentialType: AgentVaultCredentialType, headerName?: string): string | null => {
    switch (credentialType) {
      case AgentVaultCredentialType.Bearer:
        return headerName || "Authorization";
      case AgentVaultCredentialType.OAuth:
        return AGENT_VAULT_OAUTH_HEADER_NAME;
      case AgentVaultCredentialType.Basic:
        return "Authorization";
      default:
        return null;
    }
  };

  // The proxy writes the credential last, so a collision costs the header rather than the token; refusing it
  // on write is what tells the author. Either half of a PATCH can introduce one, which is why both are read.
  const assertCustomHeadersDoNotShadowCredential = (
    config: { type: AgentVaultCredentialType; headerName?: string },
    customHeaders: { name: string }[] | undefined
  ) => {
    if (!customHeaders?.length) return;
    const credentialHeader = credentialHeaderName(config.type, config.headerName);
    if (!credentialHeader) return;

    const clash = customHeaders.find((header) => header.name.toLowerCase() === credentialHeader.toLowerCase());
    if (clash) {
      throw new BadRequestError({
        message: `The ${credentialHeader} header is already set by the credential. Rename the custom header or change the credential.`
      });
    }
  };

  // An authorization only comes from a browser sign-in in the UI, so a machine identity could never hold one.
  const assertOauthConnectedByUser = (ctx: TGetAccessBundleDTO["ctx"], credential?: TAgentVaultCredentialUpdate) => {
    if (credential?.type === AgentVaultCredentialType.OAuth && ctx.actor !== ActorType.USER) {
      throw new BadRequestError({ message: "OAuth services can only be connected by a user in the Infisical UI." });
    }
  };

  // The tokens come from an authorization the same user completed. Claiming it deletes it right before the write,
  // and a save that then fails puts it back, so it can be retried without authorizing again.
  const claimOauthCredential = async ({
    projectId,
    ctx,
    accessBundleId,
    serviceId,
    serverUrl,
    authorizationId,
    previousRequiredScopes
  }: {
    projectId: string;
    ctx: TGetAccessBundleDTO["ctx"];
    accessBundleId: string;
    serviceId?: string;
    serverUrl: string;
    authorizationId: string;
    previousRequiredScopes?: string[];
  }) => {
    const claim = await agentVaultOauthService.claimAuthorization({
      authorizationId,
      projectId,
      accessBundleId,
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

  // Setup is counted over every bundle the caller reaches, since an admin can start a session on one they were never
  // granted.
  const listAccessBundles = async ({ projectId, ctx, requiresSetup, granted, ...page }: TListAccessBundlesDTO) => {
    const { permission, accessBundleIds, grantedAccessBundleIds } = await getAgentVaultGrantedReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    // null is every bundle in the project, which only an admin reaches.
    const scopeIds = granted ? grantedAccessBundleIds : accessBundleIds;
    const excludeIds = granted === false ? grantedAccessBundleIds : [];
    const excluded = new Set(excludeIds);

    const owner = ownerOrNullOf(ctx);
    const pendingByBundleOf = async (bundleIds: string[] | null) => {
      const byBundle = new Map<string, { id: string; name: string }[]>();
      if (!owner || bundleIds?.length === 0) return byBundle;
      const statuses = await agentVaultPersonalValueService.findStatusesForOwner({
        projectId,
        owner,
        accessBundleIds: bundleIds,
        withVariableReferences: false
      });
      statuses
        .filter((status) => !status.isConfigured && !excluded.has(status.accessBundleId))
        .forEach((status) =>
          byBundle.set(status.accessBundleId, [
            ...(byBundle.get(status.accessBundleId) ?? []),
            { id: status.serviceId, name: status.serviceName }
          ])
        );
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
    // Variables are admin only, so a member's services leave variableReferences out. An empty list would claim
    // they use no variables. The OAuth sign-in state is the admin's account, so members don't get it either.
    const canReadVariables = permission.can(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

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
      services: services.map((service) => {
        const projected = projectService(
          service,
          customHeaders.filter((header) => header.serviceId === service.id),
          substitutions.filter((substitution) => substitution.serviceId === service.id),
          variableReferences.filter((reference) => reference.serviceId === service.id)
        );
        const status = statuses.find((entry) => entry.serviceId === service.id);
        const { credential } = projected;
        return {
          ...projected,
          ...(canReadVariables
            ? {}
            : {
                variableReferences: undefined,
                credential:
                  credential.type === AgentVaultCredentialType.OAuth
                    ? { ...credential, expiresAt: undefined, authorizedAt: undefined, lastError: undefined }
                    : credential
              }),
          // The caller's own values, null when the admin sets the whole credential.
          personalValues: status ? { isConfigured: status.isConfigured, fields: status.fields } : null
        };
      })
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
    // a grant, a personal values save or a removal. The bundle's delete cascades to its services and their values,
    // and roles go with the grants.
    return agentVaultAccessBundleDAL.transaction(async (tx) => {
      await agentVaultAccessBundleDAL.lockByIdInProject({ id: bundle.id, projectId: rest.projectId }, tx);
      await agentVaultServiceDAL.lockByAccessBundleId(bundle.id, tx);
      await membershipDAL.delete(bundleScope(rest.projectId, bundle.id), tx);
      return agentVaultAccessBundleDAL.deleteById(bundle.id, tx);
    });
  };

  const checkHostPatternConflicts = async (
    {
      accessBundleId,
      hostPattern,
      excludeServiceId
    }: {
      accessBundleId: string;
      hostPattern: string;
      excludeServiceId?: string;
    },
    // Without a tx this reads the replica outside any lock, so two creates for the same host both pass.
    tx?: Knex
  ) => {
    const siblings = await agentVaultServiceDAL.findByAccessBundleId(accessBundleId, tx);
    const conflicts = findHostPatternConflicts(
      hostPattern,
      siblings.filter((candidate) => candidate.id !== excludeServiceId)
    );
    if (conflicts.length) {
      throw new BadRequestError({ message: describeConflict(conflicts[0]) });
    }
  };

  const createService = async ({
    accessBundleId,
    type,
    name,
    hostPattern: requestedHostPattern,
    serverUrl,
    transport,
    allowedMethods,
    allowedPathPrefixes,
    credential,
    customHeaders,
    substitutions,
    ...rest
  }: TCreateServiceDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    assertOauthConnectedByUser(rest.ctx, credential);

    const serviceType = getAgentVaultServiceType(type);
    assertServiceFieldsSupported(serviceType, {
      hostPattern: requestedHostPattern,
      allowedMethods,
      allowedPathPrefixes,
      customHeaders,
      substitutions,
      serverUrl,
      transport
    });
    assertCredentialTypeSupported(serviceType, credential.type);
    const serviceConfig = buildServiceConfig(serviceType, { serverUrl, transport });
    const hostPattern = resolveServiceHostPattern(serviceType, serviceConfig, requestedHostPattern);

    const existing = await agentVaultServiceDAL.findOne({ accessBundleId: bundle.id, name });
    if (existing) {
      throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
    }

    await checkHostPatternConflicts({ accessBundleId: bundle.id, hostPattern });

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
    assertCustomHeadersDoNotShadowCredential(split ? split.config : { type: credential.type }, customHeaders);
    const secret = split?.secret ?? null;
    const memberProvidedFields = split?.memberProvidedFields ?? null;

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

    const oauth =
      credential.type === AgentVaultCredentialType.OAuth
        ? await claimOauthCredential({
            projectId: rest.projectId,
            ctx: rest.ctx,
            accessBundleId: bundle.id,
            serverUrl: serviceConfig.serverUrl!,
            authorizationId: credential.authorizationId
          })
        : null;
    const credentialConfig: TAgentVaultCredentialConfig = oauth ? oauth.config : split!.config;
    let encryptedCredential: Buffer | null = null;
    if (oauth) encryptedCredential = oauth.encryptedCredential;
    else if (secret) encryptedCredential = encryptor({ plainText: Buffer.from(JSON.stringify(secret)) }).cipherTextBlob;

    // The pre-check above is only a fast failure. The authoritative one runs under the bundle row lock,
    // the same lock addMembers takes, because no database constraint can express host-pattern overlap.
    const write = () =>
      agentVaultServiceDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        await checkHostPatternConflicts({ accessBundleId: bundle.id, hostPattern }, tx);

        const created = await agentVaultServiceDAL.create(
          {
            accessBundleId: bundle.id,
            name,
            type: serviceType.type,
            config: serviceConfig,
            hostPattern,
            allowedMethods: allowedMethods ?? null,
            allowedPathPrefixes: allowedPathPrefixes ?? null,
            credentialType: credential.type,
            credentialConfig,
            encryptedCredential,
            memberProvidedFields
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

        return { created, insertedCustomHeaders, insertedSubstitutions, variableReferences };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      await oauth?.claim.restore();
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
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
      service: projectService(
        result.created,
        result.insertedCustomHeaders,
        result.insertedSubstitutions,
        result.variableReferences
      ),
      accessBundleName: bundle.name
    };
  };

  const updateService = async ({
    accessBundleId,
    serviceId,
    type,
    name,
    credential,
    customHeaders,
    hostPattern: sentHostPattern,
    serverUrl: sentServerUrl,
    transport: sentTransport,
    allowedMethods: sentAllowedMethods,
    allowedPathPrefixes: sentAllowedPathPrefixes,
    substitutions: sentSubstitutions,
    ...rest
  }: TUpdateServiceDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    assertOauthConnectedByUser(rest.ctx, credential);

    const service = await agentVaultServiceDAL.findByIdInAccessBundle({ id: serviceId, accessBundleId: bundle.id });
    if (!service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });

    const serviceType = getAgentVaultServiceType(service.type);
    if (type !== service.type) {
      throw new BadRequestError({
        message: `The service '${service.name}' is an ${serviceType.label} service, so send 'type': '${service.type}'. A service's type can't be changed; create a new service of the other type instead.`
      });
    }
    const sentFields = dropReadBackServiceFields(
      serviceType,
      {
        hostPattern: sentHostPattern,
        serverUrl: sentServerUrl,
        transport: sentTransport,
        allowedMethods: sentAllowedMethods,
        allowedPathPrefixes: sentAllowedPathPrefixes,
        substitutions: sentSubstitutions
      },
      service.hostPattern
    );
    // The schema's check sees the read-back fields too, so a request holding only those reaches here with nothing to
    // change.
    if ([name, credential, customHeaders, ...Object.values(sentFields)].every((value) => value === undefined)) {
      throw new BadRequestError({ message: "Provide at least one field besides 'type' to update" });
    }
    const { hostPattern: requestedHostPattern, allowedMethods, allowedPathPrefixes, substitutions } = sentFields;
    const serverUrl = sentFields.serverUrl ?? undefined;
    const transport = sentFields.transport ?? undefined;
    assertServiceFieldsSupported(serviceType, {
      hostPattern: requestedHostPattern,
      allowedMethods,
      allowedPathPrefixes,
      customHeaders,
      substitutions,
      serverUrl,
      transport
    });
    if (credential) assertCredentialTypeSupported(serviceType, credential.type);

    // The fields of the type's config this request sent. Ones left out keep their stored value, so the config
    // is merged here for the fast checks and again under the lock against the row read there.
    const configUpdate = shake({ serverUrl, transport }, (value) => value === undefined);
    const hasConfigUpdate = Object.keys(configUpdate).length > 0;
    const deriveHostPattern = (config: TAgentVaultServiceConfig) =>
      resolveServiceHostPattern(serviceType, config, requestedHostPattern);
    const serviceConfig = hasConfigUpdate ? buildServiceConfig(serviceType, configUpdate, service.config) : undefined;
    const hostPattern =
      serviceConfig && serviceType.deriveHostPattern ? deriveHostPattern(serviceConfig) : requestedHostPattern;

    const storedOauth =
      service.credentialType === AgentVaultCredentialType.OAuth
        ? (service.credentialConfig as TAgentVaultOauthConfig)
        : undefined;
    const oauthAuthorizationId =
      credential?.type === AgentVaultCredentialType.OAuth ? credential.authorizationId : undefined;
    const storedServerUrl = getServiceServerUrl(service.config);
    const staysOauth = credential ? credential.type === AgentVaultCredentialType.OAuth : Boolean(storedOauth);
    if (serverUrl !== undefined && serverUrl !== storedServerUrl && staysOauth && !oauthAuthorizationId) {
      throw new BadRequestError({ message: OAUTH_SERVER_URL_NEEDS_AUTHORIZATION_MESSAGE });
    }

    if (name && name !== service.name) {
      const existing = await agentVaultServiceDAL.findOne({ accessBundleId: bundle.id, name });
      if (existing) {
        throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
      }
    }

    if (hostPattern && hostPattern !== service.hostPattern) {
      await checkHostPatternConflicts({
        accessBundleId: bundle.id,
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

    const cipherForTransformations =
      customHeaders?.length || substitutions?.length ? await getProjectCipher(rest.projectId) : null;
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

    const oauth = oauthAuthorizationId
      ? await claimOauthCredential({
          projectId: rest.projectId,
          ctx: rest.ctx,
          accessBundleId: bundle.id,
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
        locked.credentialType === AgentVaultCredentialType.OAuth
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
        if (lockedOauth && !oauth && (!credential || credential.type === AgentVaultCredentialType.OAuth)) {
          checkOauthServerUnderLock({
            requestedServerUrl: serverUrl,
            readServerUrl: storedServerUrl,
            effectiveServerUrl: getServiceServerUrl(lockedServiceConfig),
            lockedOauth
          });
        }
      }

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
        const lockedBundle = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!lockedBundle) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        const locked = await agentVaultServiceDAL.lockByIdInAccessBundle(
          { id: service.id, accessBundleId: bundle.id },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
        const reconciled = reconcileWithLockedRow(locked);

        // Only when the pattern actually changes, against the siblings read under the lock.
        if (reconciled.hostPattern && reconciled.hostPattern !== locked.hostPattern) {
          await checkHostPatternConflicts(
            { accessBundleId: bundle.id, hostPattern: reconciled.hostPattern, excludeServiceId: service.id },
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
          reconciled.hostPattern !== undefined ||
          reconciled.serviceConfig !== undefined ||
          allowedMethods !== undefined ||
          allowedPathPrefixes !== undefined ||
          Object.keys(reconciled.credentialUpdate).length > 0;

        const updatedService = hasColumnUpdate
          ? await agentVaultServiceDAL.updateById(
              service.id,
              {
                name,
                hostPattern: reconciled.hostPattern,
                ...(reconciled.serviceConfig === undefined ? {} : { config: reconciled.serviceConfig }),
                // `null` clears the restriction, `undefined` leaves the column alone.
                ...(allowedMethods === undefined ? {} : { allowedMethods }),
                ...(allowedPathPrefixes === undefined ? {} : { allowedPathPrefixes }),
                ...reconciled.credentialUpdate
              },
              tx
            )
          : locked;

        // A saved value goes only when it no longer applies: a new credential type drops every one, and a field the
        // admin takes back drops that field's. A field members still provide keeps what they saved. The update above
        // wrote the service row, which is what a personal values save waits on.
        if (memberFieldsChanged) {
          if (credentialTypeChanged || !nextMemberFields?.length) {
            await agentVaultPersonalValueDAL.delete({ serviceId: service.id }, tx);
          } else {
            await agentVaultPersonalValueDAL.deleteForServiceExceptFields(
              { serviceId: service.id, keepFields: nextMemberFields },
              tx
            );
          }
        }

        // Outside the lock, two concurrent PATCHes both pass the ownership check and the loser's writes no-op.
        const applyDiff = async <TRow extends { id: string; encryptedValue: Buffer }, TColumns>(
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

        return { updatedService, updatedCustomHeaders, updatedSubstitutions, variableReferences };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      await oauth?.claim.restore();
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
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
      service: projectService(
        result.updatedService,
        result.updatedCustomHeaders,
        result.updatedSubstitutions,
        result.variableReferences
      ),
      accessBundleName: bundle.name,
      update: {
        hostPattern: requestedHostPattern,
        serverUrl,
        transport,
        allowedMethods,
        allowedPathPrefixes,
        substitutions
      },
      credentialReplaced
    };
  };

  const deleteService = async ({ accessBundleId, serviceId, ...rest }: TDeleteServiceDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const service = await agentVaultServiceDAL.findOne({ id: serviceId, accessBundleId: bundle.id });
    if (!service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });

    // Read before the delete, since CASCADE takes these rows with the service.
    const { customHeaders, substitutions, variableReferences } = await loadTransformations([service.id]);
    const deleted = await agentVaultServiceDAL.deleteById(service.id);
    return {
      service: projectService(deleted, customHeaders, substitutions, variableReferences),
      accessBundleName: bundle.name
    };
  };

  const listMembers = async ({ accessBundleId, search, limit, offset, ...rest }: TListMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return agentVaultAccessBundleDAL.findMembers({
      projectId: rest.projectId,
      accessBundleId: bundle.id,
      search,
      limit,
      offset
    });
  };

  // The candidates for a grant are the product's own members, since addMembers refuses anyone else, minus
  // whoever already holds this bundle. A member reaching it only through a granted group stays a
  // candidate: an individual grant is a different thing, and it outlives the group membership.
  const listAvailableMembers = async ({ accessBundleId, search, limit, offset, ...rest }: TListMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return agentVaultMemberDAL.findProductMembers({
      projectId: rest.projectId,
      orgId: rest.ctx.actorOrgId,
      actorTypes: ALL_GRANTEE_ACTOR_TYPES,
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
    createService,
    updateService,
    deleteService,
    listMembers,
    listAvailableMembers,
    addMembers,
    revokeMembers
  };
};
