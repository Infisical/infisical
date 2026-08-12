import { OrganizationActionScope, TSandboxes } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TSandboxDALFactory } from "./sandbox-dal";
import { SANDBOX_INTEGRATIONS, SandboxCredentialRole, SandboxIntegrationType } from "./sandbox-integrations";
import { getPamProxies, startPamProxies, stopPamProxies } from "./sandbox-pam-runtime";
import { TSandboxProjectResolverFactory } from "./sandbox-project-resolver";
import { bootSandbox, execInSandbox, isSandboxBooted, setSandboxEnv, shutdownSandbox } from "./sandbox-runtime";
import {
  SandboxStatus,
  TAddSandboxIntegrationDTO,
  TCreateSandboxDTO,
  TExecInSandboxDTO,
  TRemoveSandboxIntegrationDTO,
  TSandbox,
  TSandboxExecResult,
  TSandboxGrants,
  TSandboxIdDTO,
  TSandboxIntegration,
  TUpdateSandboxDTO
} from "./sandbox-types";

type TSandboxServiceFactoryDep = {
  sandboxDAL: TSandboxDALFactory;
  sandboxProjectResolver: TSandboxProjectResolverFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const EMPTY_GRANTS: TSandboxGrants = { integrations: [], pamAccountIds: [] };

const normalizeGrants = (value: unknown): TSandboxGrants => {
  const grants = (value ?? {}) as Partial<TSandboxGrants>;
  return {
    integrations: grants.integrations ?? [],
    pamAccountIds: grants.pamAccountIds ?? []
  };
};

/** Status is never stored: it is whatever the runtime currently says, so a restart can't leave a row claiming to be running. */
const toSandbox = (row: TSandboxes): TSandbox => ({
  id: row.id,
  orgId: row.orgId,
  name: row.name,
  description: row.description ?? null,
  status: isSandboxBooted(row.id) ? SandboxStatus.Running : SandboxStatus.Stopped,
  vcpu: row.vcpu,
  memoryMb: row.memoryMb,
  grants: normalizeGrants(row.grants),
  agentType: (row.agentType as TSandbox["agentType"]) ?? null,
  hasAgentToken: Boolean(row.encryptedAgentToken),
  commandsRun: row.commandsRun,
  lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
  createdAt: new Date(row.createdAt).toISOString()
});

export const sandboxServiceFactory = ({
  sandboxDAL,
  sandboxProjectResolver,
  permissionService,
  kmsService
}: TSandboxServiceFactoryDep) => {
  const $encryptAgentToken = async (orgId: string, token: string) => {
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    return encryptor({ plainText: Buffer.from(token) }).cipherTextBlob;
  };

  /**
   * Sandboxes have no CASL subject of their own yet, so org membership plus the org-level Settings
   * ability stands in for it. A dedicated subject is the follow-up.
   */
  const $authorize = async (actor: OrgServiceActor, isWrite: boolean) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    const action = isWrite ? OrgPermissionActions.Edit : OrgPermissionActions.Read;
    if (!permission.can(action, OrgPermissionSubjects.Settings)) {
      throw new ForbiddenRequestError({
        message: isWrite
          ? "You do not have permission to manage sandboxes"
          : "You do not have permission to view sandboxes"
      });
    }
  };

  /** Scoped by orgId as well as id, so an ID from another org reads as not found rather than forbidden. */
  const $resolve = async (sandboxId: string, actor: OrgServiceActor, isWrite: boolean) => {
    await $authorize(actor, isWrite);

    const row = await sandboxDAL.findOne({ id: sandboxId, orgId: actor.orgId });
    if (!row) throw new NotFoundError({ message: `Sandbox with ID '${sandboxId}' was not found` });

    return row;
  };

  const listSandboxes = async (actor: OrgServiceActor): Promise<TSandbox[]> => {
    await $authorize(actor, false);
    const rows = await sandboxDAL.findByOrg(actor.orgId);
    return rows.map(toSandbox);
  };

  const getSandboxById = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> =>
    toSandbox(await $resolve(sandboxId, actor, false));

  const createSandbox = async (dto: TCreateSandboxDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    await $authorize(actor, true);

    const clash = await sandboxDAL.findOne({ orgId: actor.orgId, name: dto.name });
    if (clash) throw new BadRequestError({ message: `A sandbox named '${dto.name}' already exists` });

    const row = await sandboxDAL.create({
      orgId: actor.orgId,
      name: dto.name,
      description: dto.description ?? null,
      vcpu: dto.vcpu,
      memoryMb: dto.memoryMb,
      grants: EMPTY_GRANTS,
      commandsRun: 0
    });

    return toSandbox(row);
  };

  const updateSandbox = async (dto: TUpdateSandboxDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    const existing = await $resolve(dto.sandboxId, actor, true);

    const hasChange = [
      dto.name,
      dto.description,
      dto.vcpu,
      dto.memoryMb,
      dto.pamAccountIds,
      dto.agentType,
      dto.agentToken
    ].some((field) => field !== undefined);
    if (!hasChange) {
      throw new BadRequestError({
        message:
          "No fields to update. Supply at least one of name, description, vcpu, memoryMb, pamAccountIds, agentType or agentToken."
      });
    }

    if (dto.name && dto.name !== existing.name) {
      const clash = await sandboxDAL.findOne({ orgId: existing.orgId, name: dto.name });
      if (clash) throw new BadRequestError({ message: `A sandbox named '${dto.name}' already exists` });
    }

    const row = await sandboxDAL.updateById(dto.sandboxId, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.vcpu !== undefined && { vcpu: dto.vcpu }),
      ...(dto.memoryMb !== undefined && { memoryMb: dto.memoryMb }),
      ...(dto.agentType !== undefined && { agentType: dto.agentType }),
      ...(dto.agentToken !== undefined && {
        encryptedAgentToken: await $encryptAgentToken(actor.orgId, dto.agentToken)
      }),
      ...(dto.pamAccountIds !== undefined && {
        grants: { ...normalizeGrants(existing.grants), pamAccountIds: dto.pamAccountIds }
      })
    });

    return toSandbox(row);
  };

  const deleteSandbox = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    await $resolve(sandboxId, actor, true);

    // Reap the running processes before the row goes, or the runtime keeps a directory nothing owns.
    stopPamProxies(sandboxId);
    await shutdownSandbox(sandboxId);
    const row = await sandboxDAL.deleteById(sandboxId);

    return toSandbox(row);
  };

  const startSandbox = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    const row = await $resolve(sandboxId, actor, true);

    if (isSandboxBooted(sandboxId)) {
      throw new BadRequestError({ message: `Sandbox '${row.name}' is already running` });
    }

    await bootSandbox(sandboxId);

    // Open a brokered proxy per granted account and tell the sandbox only the port. The identity
    // token and the database credential both stay in this process.
    const grants = normalizeGrants(row.grants);
    const targets = await sandboxDAL.findPamAccountTargets(grants.pamAccountIds);
    const proxies = await startPamProxies(sandboxId, targets);

    setSandboxEnv(sandboxId, {
      ...Object.fromEntries(
        proxies.map((proxy) => [
          `PAM_${proxy.accountName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PORT`,
          String(proxy.port)
        ])
      ),
      ...(proxies[0] && { PGHOST: "127.0.0.1", PGPORT: String(proxies[0].port) })
    });

    return toSandbox(row);
  };

  const stopSandbox = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    const row = await $resolve(sandboxId, actor, true);

    if (!isSandboxBooted(sandboxId)) {
      throw new BadRequestError({ message: `Sandbox '${row.name}' is not running` });
    }

    stopPamProxies(sandboxId);
    await shutdownSandbox(sandboxId);
    return toSandbox(row);
  };

  const execCommand = async (
    { sandboxId, command }: TExecInSandboxDTO,
    actor: OrgServiceActor
  ): Promise<TSandboxExecResult> => {
    const row = await $resolve(sandboxId, actor, true);

    if (!isSandboxBooted(sandboxId)) {
      throw new BadRequestError({
        message: `Sandbox '${row.name}' is not running. Start it before running commands.`
      });
    }

    const result = await execInSandbox(sandboxId, command);

    await sandboxDAL.updateById(sandboxId, {
      $incr: { commandsRun: 1 },
      lastActivityAt: new Date()
    });

    return result;
  };

  const addIntegration = async (
    { sandboxId, integration }: TAddSandboxIntegrationDTO,
    actor: OrgServiceActor
  ): Promise<TSandbox> => {
    const existing = await $resolve(sandboxId, actor, true);
    const definition = SANDBOX_INTEGRATIONS[integration.type];

    // Known integrations own their hostnames so a caller can't widen a GitHub grant to another host;
    // Custom is the only type that takes them from the request.
    const hostnames =
      integration.type === SandboxIntegrationType.Custom
        ? [...new Set((integration.hostnames ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean))]
        : definition.hostnames;

    if (!hostnames.length) {
      throw new BadRequestError({ message: "Provide at least one hostname for a custom endpoint" });
    }

    // Known types own their credential config too, for the same reason they own their hostnames:
    // otherwise a caller could point a "GitHub" grant at a header of their choosing.
    const credential =
      integration.type === SandboxIntegrationType.Custom
        ? (integration.credential ?? {
            role: SandboxCredentialRole.HeaderRewrite,
            headerName: definition.headerName,
            headerPrefix: definition.headerPrefix
          })
        : {
            role: definition.role,
            headerName: definition.headerName,
            headerPrefix: definition.headerPrefix
          };

    if (credential.role === SandboxCredentialRole.HeaderRewrite && !credential.headerName?.trim()) {
      throw new BadRequestError({ message: "A header rewrite requires a header name" });
    }

    if (
      credential.role === SandboxCredentialRole.Substitution &&
      (!credential.placeholderKey?.trim() ||
        !credential.placeholderValue?.trim() ||
        !credential.substitutionSurfaces?.length)
    ) {
      throw new BadRequestError({
        message:
          "Secret substitution requires an environment variable name, a placeholder value, and at least one surface to replace in"
      });
    }

    const grants = normalizeGrants(existing.grants);
    const added: TSandboxIntegration = {
      id: crypto.randomUUID(),
      type: integration.type,
      hostnames,
      secret: integration.secret,
      credential
    };

    const row = await sandboxDAL.updateById(sandboxId, {
      grants: { ...grants, integrations: [...grants.integrations, added] }
    });

    return toSandbox(row);
  };

  const removeIntegration = async (
    { sandboxId, integrationId }: TRemoveSandboxIntegrationDTO,
    actor: OrgServiceActor
  ): Promise<TSandbox> => {
    const existing = await $resolve(sandboxId, actor, true);
    const grants = normalizeGrants(existing.grants);

    const remaining = grants.integrations.filter((item) => item.id !== integrationId);
    if (remaining.length === grants.integrations.length) {
      throw new NotFoundError({ message: `Integration with ID '${integrationId}' was not found` });
    }

    const row = await sandboxDAL.updateById(sandboxId, { grants: { ...grants, integrations: remaining } });
    return toSandbox(row);
  };

  const listPamProxies = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor) => {
    await $resolve(sandboxId, actor, false);
    return getPamProxies(sandboxId);
  };

  const resolveProjectId = async (actor: OrgServiceActor) => {
    await $authorize(actor, false);
    return sandboxProjectResolver.resolve(actor);
  };

  return {
    listPamProxies,
    addIntegration,
    removeIntegration,
    resolveProjectId,
    listSandboxes,
    getSandboxById,
    createSandbox,
    updateSandbox,
    deleteSandbox,
    startSandbox,
    stopSandbox,
    execCommand
  };
};

export type TSandboxServiceFactory = ReturnType<typeof sandboxServiceFactory>;
