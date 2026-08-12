import { OrganizationActionScope, TSandboxes } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TSandboxDALFactory } from "./sandbox-dal";
import { TSandboxProjectResolverFactory } from "./sandbox-project-resolver";
import { bootSandbox, execInSandbox, isSandboxBooted, shutdownSandbox } from "./sandbox-runtime";
import {
  SandboxStatus,
  TCreateSandboxDTO,
  TExecInSandboxDTO,
  TSandbox,
  TSandboxExecResult,
  TSandboxGrants,
  TSandboxIdDTO,
  TUpdateSandboxDTO
} from "./sandbox-types";

type TSandboxServiceFactoryDep = {
  sandboxDAL: TSandboxDALFactory;
  sandboxProjectResolver: TSandboxProjectResolverFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

const EMPTY_GRANTS: TSandboxGrants = { pamAccountIds: [], proxiedServiceIds: [], clis: [] };

const normalizeGrants = (value: unknown): TSandboxGrants => {
  const grants = (value ?? {}) as Partial<TSandboxGrants>;
  return {
    pamAccountIds: grants.pamAccountIds ?? [],
    proxiedServiceIds: grants.proxiedServiceIds ?? [],
    clis: grants.clis ?? []
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
  commandsRun: row.commandsRun,
  lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
  createdAt: new Date(row.createdAt).toISOString()
});

export const sandboxServiceFactory = ({
  sandboxDAL,
  sandboxProjectResolver,
  permissionService
}: TSandboxServiceFactoryDep) => {
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
      grants: { ...EMPTY_GRANTS, ...dto.grants },
      commandsRun: 0
    });

    return toSandbox(row);
  };

  const updateSandbox = async (dto: TUpdateSandboxDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    const existing = await $resolve(dto.sandboxId, actor, true);

    const hasChange = [dto.name, dto.description, dto.vcpu, dto.memoryMb, dto.grants].some(
      (field) => field !== undefined
    );
    if (!hasChange) {
      throw new BadRequestError({
        message: "No fields to update. Supply at least one of name, description, vcpu, memoryMb or grants."
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
      ...(dto.grants && { grants: { ...normalizeGrants(existing.grants), ...dto.grants } })
    });

    return toSandbox(row);
  };

  const deleteSandbox = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    await $resolve(sandboxId, actor, true);

    // Reap the running process before the row goes, or the runtime keeps a directory nothing owns.
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
    return toSandbox(row);
  };

  const stopSandbox = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    const row = await $resolve(sandboxId, actor, true);

    if (!isSandboxBooted(sandboxId)) {
      throw new BadRequestError({ message: `Sandbox '${row.name}' is not running` });
    }

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

  const resolveProjectId = async (actor: OrgServiceActor) => {
    await $authorize(actor, false);
    return sandboxProjectResolver.resolve(actor);
  };

  return {
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
