import { ForbiddenError } from "@casl/ability";

import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { logger } from "@app/lib/logger";
import { TGenericPermission } from "@app/lib/types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import {
  TAgentVaultOauthServiceFactory,
  TOauthVariableConnected,
  TVariableSignInStart
} from "../agent-vault-oauth/agent-vault-oauth-service";
import { TAgentVaultOauthSecret } from "../agent-vault-oauth/agent-vault-oauth-types";
import { TAgentVaultPersonalValueDALFactory } from "../agent-vault-personal-value/agent-vault-personal-value-dal";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import {
  AgentVaultOauthVariableConnectMethod,
  AgentVaultVariableScope,
  AgentVaultVariableType
} from "../agent-vault/agent-vault-enums";
import { ownerOf, ownerOrNullOf, TAgentVaultOwner } from "../agent-vault/agent-vault-owner-fns";
import { getAgentVaultPermission, getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { AGENT_VAULT_MAX_PERSONAL_VARIABLES, AGENT_VAULT_MAX_VARIABLES } from "../agent-vault/agent-vault-variable-fns";
import {
  describeOauthVariableImportProblem,
  describeOauthVariableSettingsProblem,
  isOauthVariableClientChanged,
  isOauthVariableSignInChanged,
  mergeOauthVariableSettings,
  oauthVariableDisconnectsOf,
  oauthVariableSecretOf,
  toImportedOauthVariableConnection,
  toOauthVariableSettings,
  toOauthVariableView
} from "./agent-vault-oauth-variable-fns";
import {
  TAgentVaultServiceUsingVariable,
  TAgentVaultVariable,
  TAgentVaultVariableDALFactory,
  TAgentVaultVariableOwnerScope
} from "./agent-vault-variable-dal";
import {
  TAgentVaultOauthVariableConfig,
  TAgentVaultOauthVariableSettings,
  TAgentVaultOauthVariableTokens,
  TAgentVaultVariableScoped,
  TAgentVaultVariableUsedByService,
  TCreateVariableDTO,
  TListVariablesDTO,
  TUpdateVariableDTO,
  TVariableByIdDTO
} from "./agent-vault-variable-types";

type TAgentVaultVariableServiceFactoryDep = {
  agentVaultVariableDAL: TAgentVaultVariableDALFactory;
  agentVaultPersonalValueDAL: Pick<TAgentVaultPersonalValueDALFactory, "delete">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsDataKeyService: TKmsDataKeyService;
  agentVaultOauthService: Pick<TAgentVaultOauthServiceFactory, "prepareVariableSignIn" | "saveVariableSignIn">;
};

const AGENT_VAULT_VARIABLE_LIST_DEFAULT_LIMIT = 20;

type TVariableSignInStarted = Omit<TVariableSignInStart, "prepared"> & {
  authorization: Awaited<ReturnType<TAgentVaultOauthServiceFactory["saveVariableSignIn"]>> | null;
};

export type TAgentVaultVariableServiceFactory = ReturnType<typeof agentVaultVariableServiceFactory>;

const isPersonal = (variable: TAgentVaultVariable) => Boolean(variable.userId || variable.identityId);

const isOwnedBy = (variable: TAgentVaultVariable, owner: TAgentVaultOwner) =>
  owner.userId ? variable.userId === owner.userId : variable.identityId === owner.identityId;

const isOauth = (variable: Pick<TAgentVaultVariable, "type">) => variable.type === AgentVaultVariableType.OAuth;

const oauthConfigOf = (variable: Pick<TAgentVaultVariable, "oauthConfig">) =>
  variable.oauthConfig as TAgentVaultOauthVariableConfig;

const settingsProblemError = (settings: TAgentVaultOauthVariableSettings) => {
  const problem = describeOauthVariableSettingsProblem(settings);
  return problem
    ? new BadRequestError({ message: problem.message, details: { field: `oauth.${problem.field}` } })
    : null;
};

// Imported tokens as the variable stores them, checked against the settings they are stored with.
const importedConnectionOf = (settings: TAgentVaultOauthVariableSettings, tokens: TAgentVaultOauthVariableTokens) => {
  const problem = describeOauthVariableImportProblem(settings, tokens);
  if (problem) throw new BadRequestError({ message: problem.message, details: { field: problem.field } });
  return toImportedOauthVariableConnection(settings, tokens, new Date()).connection;
};

const importedOf = (variable: Pick<TAgentVaultVariable, "id" | "key" | "oauthConfig">): TOauthVariableConnected => {
  const { connection } = oauthConfigOf(variable);
  return {
    variableId: variable.id,
    key: variable.key,
    method: AgentVaultOauthVariableConnectMethod.Import,
    issuer: connection?.issuer ?? "",
    scopes: connection?.grantedScopes ?? []
  };
};

export const agentVaultVariableServiceFactory = ({
  agentVaultVariableDAL,
  agentVaultPersonalValueDAL,
  membershipDAL,
  permissionService,
  kmsDataKeyService,
  agentVaultOauthService
}: TAgentVaultVariableServiceFactoryDep) => {
  const getProjectCipher = (projectId: string) =>
    kmsDataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  /**
   * Global variables take their own permission, reads included: a member can use a service without seeing what it is
   * built from. Personal variables are the caller's own, and any Agent Vault member keeps them. Nobody, an admin
   * included, can name or read another actor's.
   */
  const resolveScope = async (
    { projectId, ctx }: TAgentVaultVariableScoped,
    scope: AgentVaultVariableScope,
    action: ProjectPermissionAgentVaultVariableActions
  ): Promise<TAgentVaultVariableOwnerScope> => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    if (scope === AgentVaultVariableScope.Global) {
      ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AgentVaultVariables);
      return { projectId, owner: null };
    }
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return { projectId, owner: ownerOf(ctx) };
  };

  const resolveListOwners = async (
    { projectId, ctx }: TAgentVaultVariableScoped,
    scope?: AgentVaultVariableScope
  ): Promise<(TAgentVaultOwner | null)[]> => {
    if (scope) {
      return [(await resolveScope({ projectId, ctx }, scope, ProjectPermissionAgentVaultVariableActions.Read)).owner];
    }

    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    const owners: (TAgentVaultOwner | null)[] = [];
    if (permission.can(ProjectPermissionAgentVaultVariableActions.Read, ProjectPermissionSub.AgentVaultVariables)) {
      owners.push(null);
    }
    const owner = ownerOrNullOf(ctx);
    if (owner) owners.push(owner);
    if (!owners.length) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultVariableActions.Read,
        ProjectPermissionSub.AgentVaultVariables
      );
    }
    return owners;
  };

  const notFound = (variableId: string) => new NotFoundError({ message: `Variable with ID '${variableId}' not found` });

  // A variable the caller may not act on reads exactly like one that does not exist, so an id never confirms that
  // someone else's personal variable is there.
  const findAccessibleVariable = async (
    { variableId, projectId, ctx }: TVariableByIdDTO,
    action: ProjectPermissionAgentVaultVariableActions
  ) => {
    const variable = await agentVaultVariableDAL.findByIdInProject({ id: variableId, projectId });
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });

    if (!variable) throw notFound(variableId);
    if (isPersonal(variable)) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultAccessBundleActions.Read,
        ProjectPermissionSub.AgentVaultAccessBundles
      );
      const owner = ownerOf(ctx);
      if (!isOwnedBy(variable, owner)) throw notFound(variableId);
      return { variable, scope: { projectId, owner } };
    }
    if (permission.cannot(action, ProjectPermissionSub.AgentVaultVariables)) {
      throw notFound(variableId);
    }
    return { variable, scope: { projectId, owner: null } };
  };

  // A member who lost a bundle keeps their personal variables, but not a view into the bundle: its services drop out
  // of what they see. Global variables get null because only the admin role can read them, and it reaches every
  // bundle; a role that could read them without that reach would need this filtered too.
  const reachableBundleIdsOf = async ({
    projectId,
    ctx,
    owner
  }: {
    projectId: string;
    ctx: TGenericPermission;
    owner: TAgentVaultOwner | null;
  }) => {
    if (!owner) return null;
    const { accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    return accessBundleIds;
  };

  // A service is reached through any bundle it is in; null reach is an admin's, which is every service.
  const isReachable = (service: TAgentVaultServiceUsingVariable, accessBundleIds: string[] | null) =>
    !accessBundleIds || service.accessBundles.some((bundle) => accessBundleIds.includes(bundle.id));

  const splitByReach = async (
    args: { projectId: string; ctx: TGenericPermission; owner: TAgentVaultOwner | null },
    services: TAgentVaultServiceUsingVariable[]
  ) => {
    if (!services.length) return { reachable: services, unreachable: [], accessBundleIds: null };
    const accessBundleIds = await reachableBundleIdsOf(args);
    if (!accessBundleIds) return { reachable: services, unreachable: [], accessBundleIds };
    const reachable = services.filter((service) => isReachable(service, accessBundleIds));
    return { reachable, unreachable: services.filter((service) => !reachable.includes(service)), accessBundleIds };
  };

  // Values never leave through this projection; only the audited value endpoint returns one. A service's bundles are
  // cut to the ones the caller reaches, since a service they reach can also be in bundles they weren't granted.
  const projectVariable = (
    variable: TAgentVaultVariable,
    services: TAgentVaultServiceUsingVariable[],
    accessBundleIds: string[] | null
  ) => ({
    id: variable.id,
    key: variable.key,
    scope: isPersonal(variable) ? AgentVaultVariableScope.Personal : AgentVaultVariableScope.Global,
    type: isOauth(variable) ? AgentVaultVariableType.OAuth : AgentVaultVariableType.Text,
    oauth: isOauth(variable) ? toOauthVariableView(oauthConfigOf(variable)) : null,
    usedByServices: services
      .filter((service) => service.variableId === variable.id)
      .map((service): TAgentVaultVariableUsedByService => ({
        id: service.serviceId,
        name: service.serviceName,
        type: service.serviceType,
        hostPattern: service.hostPattern,
        accessBundles: accessBundleIds
          ? service.accessBundles.filter((bundle) => accessBundleIds.includes(bundle.id))
          : service.accessBundles
      })),
    createdAt: variable.createdAt,
    updatedAt: variable.updatedAt
  });

  const duplicateKeyMessage = (key: string, { owner }: TAgentVaultVariableOwnerScope) =>
    owner ? `You already have a variable named '${key}'.` : `A variable named '${key}' already exists.`;

  // `details.field` names the input at fault, so a form can show the message there without matching its text.
  const duplicateKeyError = (key: string, scope: TAgentVaultVariableOwnerScope) =>
    new BadRequestError({ message: duplicateKeyMessage(key, scope), details: { field: "key" } });

  const inUseMessage = (
    key: string,
    services: TAgentVaultServiceUsingVariable[],
    { owner }: TAgentVaultVariableOwnerScope
  ) => {
    const names = services.map((service) => `'${service.serviceName}'`).join(", ");
    if (owner) {
      return services.length === 1
        ? `The variable '${key}' is used by your personal values for the service ${names}. Remove it from the service before you delete it.`
        : `The variable '${key}' is used by your personal values for the services ${names}. Remove it from those services before you delete it.`;
    }
    return services.length === 1
      ? `The variable '${key}' is used by the service ${names}. Remove it from that service before deleting it.`
      : `The variable '${key}' is used by the services ${names}. Remove it from those services before deleting it.`;
  };

  type TProjectCipher = Awaited<ReturnType<typeof getProjectCipher>>;

  const sealJsonWith = (cipher: TProjectCipher, value: unknown) =>
    cipher.encryptor({ plainText: Buffer.from(JSON.stringify(value)) }).cipherTextBlob;

  const sealJson = async (projectId: string, value: unknown) => sealJsonWith(await getProjectCipher(projectId), value);

  const sealValue = (projectId: string, value: string) => sealJson(projectId, { value });

  const listVariables = async ({ projectId, ctx, scope: scopeName, limit, ...query }: TListVariablesDTO) => {
    // A key can name a global variable and one of the caller's own, so a lookup by keys has to say which.
    if (query.keys && !scopeName) {
      throw new BadRequestError({
        message: "Send a scope with keys. A key can name both a global variable and one of your own personal variables."
      });
    }
    const owners = await resolveListOwners({ projectId, ctx }, scopeName);
    const personalOwner = owners.find((owner) => owner !== null) ?? null;

    // A lookup by keys returns every key that exists unless the caller caps it, so a missing entry always means
    // the key doesn't exist.
    // The Used By sort counts only what the page will show.
    const accessBundleIds = await reachableBundleIdsOf({ projectId, ctx, owner: personalOwner });
    const { variables, totalCount } = await agentVaultVariableDAL.findForList({
      projectId,
      owners,
      ...query,
      accessBundleIds: accessBundleIds ?? undefined,
      limit: limit ?? query.keys?.length ?? AGENT_VAULT_VARIABLE_LIST_DEFAULT_LIMIT
    });
    const services = await agentVaultVariableDAL.findServicesUsing(variables.map((variable) => variable.id));
    const reachable = services.filter((service) => isReachable(service, accessBundleIds));

    return {
      variables: variables.map((variable) => projectVariable(variable, reachable, accessBundleIds)),
      totalCount
    };
  };

  const oauthSettingsForCreate = (oauth: TCreateVariableDTO["oauth"]) => {
    if (!oauth) {
      throw new BadRequestError({
        message: "An OAuth variable needs its provider settings in 'oauth'.",
        details: { field: "oauth" }
      });
    }
    const settings = toOauthVariableSettings(oauth);
    const problem = settingsProblemError(settings);
    if (problem) throw problem;
    return settings;
  };

  // Saving the sign-in edits the variable and the response shows it, so creating alone isn't enough to start one.
  const assertCanStartSignIn = async (scoped: TAgentVaultVariableScoped) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, scoped);
    const missing = [
      ProjectPermissionAgentVaultVariableActions.Edit,
      ProjectPermissionAgentVaultVariableActions.Read
    ].some((action) => permission.cannot(action, ProjectPermissionSub.AgentVaultVariables));
    if (missing) {
      throw new ForbiddenRequestError({
        message:
          "Starting a sign-in with a new variable needs permission to read and edit variables. Create the variable without 'signIn', or ask an admin for that access."
      });
    }
  };

  const createVariable = async ({
    key,
    value,
    type,
    oauth,
    tokens,
    signIn,
    scope: scopeName,
    ...rest
  }: TCreateVariableDTO) => {
    const scope = await resolveScope(rest, scopeName, ProjectPermissionAgentVaultVariableActions.Create);
    const { owner } = scope;
    const cap = owner ? AGENT_VAULT_MAX_PERSONAL_VARIABLES : AGENT_VAULT_MAX_VARIABLES;
    const assertRoomFor = (existing: { key: string }[]) => {
      if (existing.some((variable) => variable.key === key)) {
        throw duplicateKeyError(key, scope);
      }
      if (existing.length >= cap) {
        throw new BadRequestError({
          message: owner
            ? `You can keep at most ${cap} personal variables. Delete an unused one first.`
            : `This project can hold at most ${cap} global variables. Delete an unused one first.`
        });
      }
    };

    let stored: { encryptedValue: Buffer | null; oauthConfig: TAgentVaultOauthVariableConfig | null };
    let signInStart: TVariableSignInStart | undefined;
    if (type === AgentVaultVariableType.OAuth) {
      // Personal values can't use an OAuth variable, so a personal one would have nothing to send it.
      if (owner) {
        throw new BadRequestError({
          message: "OAuth variables can only be global. Create it with scope 'global'.",
          details: { field: "scope" }
        });
      }
      if (signIn) await assertCanStartSignIn(rest);
      const settings = oauthSettingsForCreate(oauth);
      if (tokens && signIn) {
        throw new BadRequestError({
          message: "Send either 'tokens' to import or 'signIn' to start a sign-in, not both.",
          details: { field: "signIn" }
        });
      }
      stored = tokens
        ? {
            encryptedValue: await sealJson(rest.projectId, oauthVariableSecretOf(tokens)),
            oauthConfig: { settings, connection: importedConnectionOf(settings, tokens) }
          }
        : { encryptedValue: null, oauthConfig: { settings, connection: null } };
      // Before the variable is saved, so a server that can't be reached leaves nothing behind. The key and the cap are
      // checked first, so a refused create registers no client; the check under the lock below is the one that holds.
      if (signIn) {
        assertRoomFor(await agentVaultVariableDAL.findKeys(scope));
        signInStart = await agentVaultOauthService.prepareVariableSignIn({
          projectId: rest.projectId,
          ctx: rest.ctx,
          settings,
          connection: null,
          encryptedValue: null,
          clientSecret: signIn.clientSecret
        });
      }
    } else {
      if (value === undefined) {
        throw new BadRequestError({ message: "A text variable needs a value.", details: { field: "value" } });
      }
      stored = { encryptedValue: await sealValue(rest.projectId, value), oauthConfig: null };
    }

    // Serialised per project, or per owner for personal variables, so the count and the key check are
    // authoritative. The unique indexes are the backstop.
    const write = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [
          owner
            ? PgSqlLock.CreateAgentVaultPersonalVariable(rest.projectId, owner.userId ?? owner.identityId!)
            : PgSqlLock.CreateAgentVaultVariable(rest.projectId)
        ]);

        assertRoomFor(await agentVaultVariableDAL.findKeys(scope, tx));

        return agentVaultVariableDAL.create(
          {
            projectId: rest.projectId,
            userId: owner?.userId ?? null,
            identityId: owner?.identityId ?? null,
            key,
            type,
            ...stored
          },
          tx
        );
      });

    let created: TAgentVaultVariable;
    try {
      created = await write();
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateKeyError(key, scope);
      throw err;
    }
    let started: TVariableSignInStarted | null = null;
    let signInError: string | undefined;
    if (signInStart) {
      const { prepared, ...start } = signInStart;
      // The variable is already saved, so a sign-in that can't be kept is reported beside it rather than failing a
      // create the caller would then repeat into a duplicate key.
      try {
        started = {
          ...start,
          authorization: prepared ? await agentVaultOauthService.saveVariableSignIn(prepared, created.id) : null
        };
      } catch (error) {
        logger.error(
          error,
          `agentVaultVariable: couldn't save the sign-in started with a new variable [variableId=${created.id}] [projectId=${rest.projectId}]`
        );
        signInError = "The variable was created, but its sign-in couldn't be started. Start a new sign-in for it.";
      }
    }
    return {
      variable: projectVariable(created, [], null),
      connected: tokens ? importedOf(created) : null,
      signIn: started,
      ...(signInError ? { signInError } : {})
    };
  };

  // A variable's type is fixed at create, so these hold for the row read before the lock too.
  const assertUpdateFitsType = (
    variable: TAgentVaultVariable,
    { value, oauth, tokens }: Pick<TUpdateVariableDTO, "value" | "oauth" | "tokens">
  ) => {
    if (isOauth(variable)) {
      if (typeof value === "string") {
        throw new BadRequestError({
          message: `The variable '${variable.key}' holds OAuth tokens, so its value can't be set. Sign in again or import new tokens to replace them, or send 'value' as null to disconnect it.`,
          details: { field: "value" }
        });
      }
      if (tokens && value === null) {
        throw new BadRequestError({
          message:
            "Send either 'tokens' to replace the variable's tokens or 'value' as null to disconnect it, not both.",
          details: { field: "tokens" }
        });
      }
      return;
    }
    if (tokens) {
      throw new BadRequestError({
        message: `The variable '${variable.key}' is a text variable, so it takes no OAuth tokens. Create an OAuth variable instead.`,
        details: { field: "tokens" }
      });
    }
    if (value === null) {
      throw new BadRequestError({
        message: `The variable '${variable.key}' is a text variable, so it always has a value. Send a new value, or delete the variable.`,
        details: { field: "value" }
      });
    }
    if (oauth) {
      throw new BadRequestError({
        message: `The variable '${variable.key}' is a text variable, so it takes no OAuth settings. Create an OAuth variable instead.`,
        details: { field: "oauth" }
      });
    }
  };

  // The secret sealed with the current tokens is still the client's while its settings stay the same.
  const keptClientSecretOf = (
    current: TAgentVaultVariable,
    before: TAgentVaultOauthVariableSettings,
    after: TAgentVaultOauthVariableSettings,
    cipher: TProjectCipher
  ) => {
    if (!current.encryptedValue || isOauthVariableClientChanged(before, after)) return undefined;
    const secret = JSON.parse(
      cipher.decryptor({ cipherTextBlob: current.encryptedValue }).toString("utf-8")
    ) as TAgentVaultOauthSecret;
    return secret.clientSecret;
  };

  const disconnectsField = (disconnects: number) => (disconnects ? { disconnects } : {});

  /**
   * Built from the row locked by the update. A sign-in setting that changed, or `value: null`, disconnects the variable:
   * the tokens and the client secret sealed with them belong to the old provider or client, and the disconnect count
   * goes up so a sign-in started before it can't complete. Any other edit keeps the sealed value untouched and the
   * connection as the locked row holds it, so a refresh committed before the lock is kept, and one after it waits for
   * the lock and then applies to what this writes. Imported tokens sent without a client secret keep the stored one
   * while the client stays the same.
   */
  const oauthUpdateOf = (
    current: TAgentVaultVariable,
    { value, oauth, tokens }: Pick<TUpdateVariableDTO, "value" | "oauth" | "tokens">,
    cipher: TProjectCipher | undefined
  ) => {
    const config = oauthConfigOf(current);
    const disconnects = oauthVariableDisconnectsOf(config);
    const settings = oauth ? mergeOauthVariableSettings(config.settings, oauth) : config.settings;
    if (oauth) {
      const problem = settingsProblemError(settings);
      if (problem) throw problem;
    }
    // Imported tokens replace whatever the variable held, under the settings this update leaves it with.
    if (tokens && cipher) {
      const imported = {
        ...tokens,
        clientSecret: tokens.clientSecret ?? keptClientSecretOf(current, config.settings, settings, cipher)
      };
      return {
        disconnected: false,
        imported: true,
        update: {
          oauthConfig: {
            settings,
            connection: importedConnectionOf(settings, imported),
            ...disconnectsField(disconnects)
          },
          encryptedValue: sealJsonWith(cipher, oauthVariableSecretOf(imported))
        }
      };
    }
    const disconnect = value === null || isOauthVariableSignInChanged(config.settings, settings);
    return {
      disconnected: disconnect && Boolean(config.connection),
      imported: false,
      update: {
        oauthConfig: {
          settings,
          connection: disconnect ? null : config.connection,
          ...disconnectsField(disconnect ? disconnects + 1 : disconnects)
        },
        ...(disconnect ? { encryptedValue: null } : {})
      }
    };
  };

  const updateVariable = async ({ variableId, key, value, oauth, tokens, ...rest }: TUpdateVariableDTO) => {
    const { variable, scope } = await findAccessibleVariable(
      { variableId, ...rest },
      ProjectPermissionAgentVaultVariableActions.Edit
    );
    assertUpdateFitsType(variable, { value, oauth, tokens });

    const encryptedValue = typeof value === "string" ? await sealValue(rest.projectId, value) : undefined;
    // Fetched before the lock: an import seals its tokens inside it, since a kept client secret is read from the
    // locked row.
    const importCipher = tokens ? await getProjectCipher(rest.projectId) : undefined;

    const write = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const current = await agentVaultVariableDAL.lockByIdInProject(
          { id: variable.id, projectId: rest.projectId },
          tx
        );
        if (!current) throw notFound(variableId);

        if (key !== undefined && key !== current.key) {
          const clash = await agentVaultVariableDAL.findByKey({ key, ...scope }, tx);
          if (clash) throw duplicateKeyError(key, scope);
        }

        const oauthUpdate =
          isOauth(current) && (oauth || value === null || tokens)
            ? oauthUpdateOf(current, { value, oauth, tokens }, importCipher)
            : undefined;

        // A rename is this row alone. Sealed text names the variable by id, so nothing that uses it changes.
        await agentVaultVariableDAL.updateById(
          current.id,
          { key, ...(encryptedValue ? { encryptedValue } : {}), ...oauthUpdate?.update },
          tx
        );
        const updated = await agentVaultVariableDAL.findByIdInProject(
          { id: current.id, projectId: rest.projectId },
          tx
        );
        const services = await agentVaultVariableDAL.findServicesUsing([current.id], tx);
        return {
          previous: current,
          updated: updated!,
          services,
          valueReplaced: oauthUpdate ? oauthUpdate.disconnected || oauthUpdate.imported : Boolean(encryptedValue),
          imported: Boolean(oauthUpdate?.imported)
        };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw duplicateKeyError(key ?? variable.key, scope);
      }
      throw err;
    }

    const { reachable, accessBundleIds } = await splitByReach({ ...rest, owner: scope.owner }, result.services);
    return {
      variable: projectVariable(result.updated, reachable, accessBundleIds),
      previousKey: result.previous.key,
      // For an OAuth variable, whether this update cleared or replaced its tokens.
      valueReplaced: result.valueReplaced,
      connected: result.imported ? importedOf(result.updated) : null
    };
  };

  // A variable as its list shows it, for a route that changed it elsewhere (a sign-in completing).
  const getVariable = async ({ variableId, ...rest }: TVariableByIdDTO) => {
    const { variable, scope } = await findAccessibleVariable(
      { variableId, ...rest },
      ProjectPermissionAgentVaultVariableActions.Read
    );
    const services = await agentVaultVariableDAL.findServicesUsing([variable.id]);
    const { reachable, accessBundleIds } = await splitByReach({ ...rest, owner: scope.owner }, services);
    return { variable: projectVariable(variable, reachable, accessBundleIds) };
  };

  const deleteVariable = async ({ variableId, ...rest }: TVariableByIdDTO) => {
    const { scope } = await findAccessibleVariable(
      { variableId, ...rest },
      ProjectPermissionAgentVaultVariableActions.Delete
    );
    const { accessBundleIds } = scope.owner
      ? await getAgentVaultReachability({ permissionService, membershipDAL }, rest)
      : { accessBundleIds: null };

    // The refusal here is the real check. The row lock waits for any save adding a reference to this variable, since
    // those take it FOR SHARE. The deferred foreign keys only back it up, and only raise at commit.
    const remove = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const variable = await agentVaultVariableDAL.lockByIdInProject(
          { id: variableId, projectId: rest.projectId },
          tx
        );
        if (!variable) throw notFound(variableId);

        const services = await agentVaultVariableDAL.findServicesUsing([variable.id], tx);
        const blocking = services.filter((service) => isReachable(service, accessBundleIds));
        if (blocking.length) throw new ConflictError({ message: inUseMessage(variable.key, blocking, scope) });

        // What the owner saved for a service they no longer reach can't be edited or used, so it doesn't hold the
        // variable in place.
        if (scope.owner && services.length) {
          await agentVaultPersonalValueDAL.delete(
            { ...scope.owner, $in: { serviceId: services.map((service) => service.serviceId) } },
            tx
          );
        }

        await agentVaultVariableDAL.deleteById(variable.id, tx);
        return variable;
      });

    try {
      return { variable: projectVariable(await remove(), [], null) };
    } catch (err) {
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new ConflictError({
          message: scope.owner
            ? "One of your personal values still uses this variable. Remove it from every service that uses it, then delete it."
            : "This variable is still used by a service. Remove it from every service that uses it, then delete it."
        });
      }
      throw err;
    }
  };

  const getVariableValue = async ({ variableId, ...rest }: TVariableByIdDTO) => {
    const { variable } = await findAccessibleVariable(
      { variableId, ...rest },
      ProjectPermissionAgentVaultVariableActions.ReadValue
    );

    if (isOauth(variable)) {
      throw new BadRequestError({
        message: `The variable '${variable.key}' is an OAuth variable, and its tokens can't be read. Services that use it send them for you.`
      });
    }

    const { decryptor } = await getProjectCipher(rest.projectId);
    const { value } = JSON.parse(decryptor({ cipherTextBlob: variable.encryptedValue! }).toString("utf-8")) as {
      value: string;
    };
    return { variable: projectVariable(variable, [], null), value };
  };

  return { listVariables, createVariable, updateVariable, deleteVariable, getVariableValue, getVariable };
};
