import { randomUUID } from "crypto";

import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionEndpointCommandActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TEndpointCommandDALFactory } from "./endpoint-command-dal";
import {
  TCancelEndpointCommandDTO,
  TEndpointCommandResponse,
  TExecuteEndpointCommandDTO,
  TGetEndpointCommandDTO,
  TListEndpointCommandsDTO,
  TReportEndpointCommandResultDTO
} from "./endpoint-command-types";
import {
  ENDPOINT_COMMAND_MAX_OUTPUT_BYTES,
  ENDPOINT_COMMAND_MAX_PER_CLAIM,
  ENDPOINT_COMMAND_PENDING_TTL_SECONDS
} from "./endpoint-constants";
import { TEndpointDeviceDALFactory } from "./endpoint-device-dal";
import { TEndpointEventDALFactory } from "./endpoint-event-dal";
import { EndpointCommandStatus, EndpointEventType } from "./endpoint-enums";
import { TEndpointProjectResolverFactory } from "./endpoint-project-resolver";

type TEndpointCommandServiceFactoryDep = {
  endpointCommandDAL: TEndpointCommandDALFactory;
  endpointDeviceDAL: TEndpointDeviceDALFactory;
  endpointEventDAL: Pick<TEndpointEventDALFactory, "insertIgnoringDuplicates">;
  endpointProjectResolver: TEndpointProjectResolverFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TEndpointCommandServiceFactory = ReturnType<typeof endpointCommandServiceFactory>;

// Remote execution is its own service for the same reason it is its own CASL subject: it is the one
// part of Endpoint that runs attacker-chosen code as root on an employee's machine, and it should be
// possible to read every line that can do that without reading the network-policy service.
export const endpointCommandServiceFactory = ({
  endpointCommandDAL,
  endpointDeviceDAL,
  endpointEventDAL,
  endpointProjectResolver,
  userDAL,
  permissionService
}: TEndpointCommandServiceFactoryDep) => {
  const $authorizeProject = async (actor: OrgServiceActor, action: ProjectPermissionEndpointCommandActions) => {
    const projectId = await endpointProjectResolver.resolve(actor.orgId);

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.Endpoint
    });

    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.EndpointCommand);

    return projectId;
  };

  // The agent authenticates as the person whose device it is, so the device comes from the logged-in
  // user rather than from an id the agent could otherwise choose.
  const $resolveDeviceForAgent = async (actor: OrgServiceActor) => {
    if (actor.type !== ActorType.USER) {
      throw new BadRequestError({
        message:
          "Infisical Endpoint agent endpoints are called by the agent on a user's device. Run 'infisical endpoint start' and sign in when the browser opens."
      });
    }

    const device = await endpointDeviceDAL.findOne({ userId: actor.id });
    if (!device) {
      throw new NotFoundError({
        message:
          "You do not have an Infisical Endpoint device registered. Ask an administrator to register one for you."
      });
    }

    return device;
  };

  // A pending command that outlived its window is expired to whoever reads it, whether or not the
  // device has polled since. Doing it here rather than with an UPDATE on the read path keeps the
  // list a plain GET; the row itself is flipped on the agent's next poll.
  const $presentStatus = (row: { status: string; expiresAt: Date }): EndpointCommandStatus => {
    if (row.status === EndpointCommandStatus.Pending && row.expiresAt.getTime() <= Date.now()) {
      return EndpointCommandStatus.Expired;
    }

    return row.status as EndpointCommandStatus;
  };

  // Never spread the row: it is selected wholesale from the table and would carry internal ids into
  // the API the moment a column is added.
  const $present = (row: {
    id: string;
    deviceId: string;
    deviceName?: string;
    status: string;
    shell: boolean;
    command: string;
    args: unknown;
    timeoutSeconds: number;
    expiresAt: Date;
    requestedByEmail?: string | null;
    reason?: string | null;
    dispatchedAt?: Date | null;
    completedAt?: Date | null;
    exitCode?: number | null;
    stdout?: string | null;
    stderr?: string | null;
    outputTruncated: boolean;
    error?: string | null;
    createdAt: Date;
  }): TEndpointCommandResponse => ({
    id: row.id,
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    status: $presentStatus(row),
    shell: row.shell,
    command: row.command,
    args: (row.args as string[] | null) ?? [],
    timeoutSeconds: row.timeoutSeconds,
    expiresAt: row.expiresAt,
    requestedByEmail: row.requestedByEmail ?? null,
    reason: row.reason ?? null,
    dispatchedAt: row.dispatchedAt ?? null,
    completedAt: row.completedAt ?? null,
    exitCode: row.exitCode ?? null,
    stdout: row.stdout ?? null,
    stderr: row.stderr ?? null,
    outputTruncated: row.outputTruncated,
    error: row.error ?? null,
    createdAt: row.createdAt
  });

  const $recordEvent = async ({
    projectId,
    deviceId,
    eventType,
    detail
  }: {
    projectId: string;
    deviceId: string;
    eventType: EndpointEventType;
    detail: Record<string, unknown>;
  }) => {
    await endpointEventDAL.insertIgnoringDuplicates([
      {
        projectId,
        deviceId,
        eventType,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
        detail
      }
    ]);
  };

  const executeCommand = async (dto: TExecuteEndpointCommandDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionEndpointCommandActions.Execute);

    const device = await endpointDeviceDAL.findById(dto.deviceId);
    // Out of project reads as missing rather than forbidden, so the API cannot be used to confirm
    // that another org's device ids exist.
    if (!device || device.projectId !== projectId) {
      throw new NotFoundError({ message: `Device with ID '${dto.deviceId}' not found` });
    }

    if (!dto.shell && dto.command.trim().includes(" ")) {
      throw new BadRequestError({
        message:
          "A command run without a shell is one program and its arguments, so the program name cannot contain spaces. Put each argument in 'args', or enable shell mode to run a script."
      });
    }

    // Nothing here stops the agent from being handed a command for an offline device — it will run on
    // the next poll, which is what expiresAt bounds — but saying so up front is the difference between
    // "nothing happened" and knowing why.
    const requester = await userDAL.findById(actor.id);

    const [created] = await endpointCommandDAL.insertMany([
      {
        deviceId: device.id,
        status: EndpointCommandStatus.Pending,
        shell: dto.shell,
        command: dto.command,
        args: JSON.stringify(dto.args),
        timeoutSeconds: dto.timeoutSeconds,
        expiresAt: new Date(Date.now() + ENDPOINT_COMMAND_PENDING_TTL_SECONDS * 1000),
        requestedByUserId: actor.id,
        requestedByEmail: requester?.email ?? requester?.username ?? null,
        reason: dto.reason ?? null
      }
    ]);

    await $recordEvent({
      projectId,
      deviceId: device.id,
      eventType: EndpointEventType.CommandIssued,
      detail: {
        commandId: created.id,
        command: created.command,
        args: dto.args,
        shell: dto.shell,
        requestedByEmail: created.requestedByEmail,
        reason: created.reason
      }
    });

    return { command: $present({ ...created, deviceName: device.name }) };
  };

  const listCommands = async (dto: TListEndpointCommandsDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionEndpointCommandActions.Read);

    if (dto.deviceId) {
      const device = await endpointDeviceDAL.findById(dto.deviceId);
      if (!device || device.projectId !== projectId) {
        throw new NotFoundError({ message: `Device with ID '${dto.deviceId}' not found` });
      }
    }

    let cursor: { createdAt: Date; id: string } | undefined;
    if (dto.cursor) {
      const decoded = await endpointCommandDAL.findByIdInProject({ id: dto.cursor, projectId });
      if (!decoded) {
        throw new BadRequestError({ message: "The page cursor does not refer to a command in this project." });
      }
      cursor = { createdAt: decoded.createdAt, id: decoded.id };
    }

    const rows = await endpointCommandDAL.findByProject({
      projectId,
      deviceId: dto.deviceId,
      limit: dto.limit,
      cursor
    });

    return {
      commands: rows.map($present),
      // The id of the last row, which is what the caller hands back as 'cursor'. Null when the page
      // was short, so the client does not need to compare lengths to know it is done.
      nextCursor: rows.length === dto.limit ? rows[rows.length - 1].id : null
    };
  };

  const getCommand = async (dto: TGetEndpointCommandDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionEndpointCommandActions.Read);

    const row = await endpointCommandDAL.findByIdInProject({ id: dto.commandId, projectId });
    if (!row) {
      throw new NotFoundError({ message: `Command with ID '${dto.commandId}' not found` });
    }

    return { command: $present(row) };
  };

  const cancelCommand = async (dto: TCancelEndpointCommandDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionEndpointCommandActions.Cancel);

    const existing = await endpointCommandDAL.findByIdInProject({ id: dto.commandId, projectId });
    if (!existing) {
      throw new NotFoundError({ message: `Command with ID '${dto.commandId}' not found` });
    }

    const canceled = await endpointCommandDAL.cancelPending(dto.commandId);
    if (!canceled) {
      throw new BadRequestError({
        message: `Command with ID '${dto.commandId}' is '${$presentStatus(existing)}' and can no longer be canceled. Only a command the device has not picked up yet can be.`
      });
    }

    return { command: $present({ ...canceled, deviceName: existing.deviceName }) };
  };

  // Agent-facing. Returns whatever this device should run now and moves those rows to Dispatched in
  // the same statement, so a command is handed out exactly once.
  const claimCommands = async (actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    await endpointCommandDAL.expireStaleForDevice(device.id);

    const claimed = await endpointCommandDAL.claimPendingForDevice({
      deviceId: device.id,
      limit: ENDPOINT_COMMAND_MAX_PER_CLAIM
    });

    return {
      commands: claimed.map((row) => ({
        id: row.id,
        shell: row.shell,
        command: row.command,
        args: (row.args as string[] | null) ?? [],
        timeoutSeconds: row.timeoutSeconds,
        maxOutputBytes: ENDPOINT_COMMAND_MAX_OUTPUT_BYTES
      }))
    };
  };

  const reportCommandResult = async (dto: TReportEndpointCommandResultDTO, actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    let status = EndpointCommandStatus.Succeeded;
    if (dto.timedOut) {
      status = EndpointCommandStatus.TimedOut;
    } else if (dto.error) {
      status = EndpointCommandStatus.Errored;
    } else if (dto.exitCode !== 0) {
      status = EndpointCommandStatus.Failed;
    }

    const completed = await endpointCommandDAL.completeDispatched({
      id: dto.commandId,
      deviceId: device.id,
      status,
      exitCode: dto.exitCode,
      stdout: dto.stdout,
      stderr: dto.stderr,
      outputTruncated: dto.outputTruncated,
      error: dto.error
    });

    // Not an error the agent can act on: the command was canceled, already reported, or belongs to
    // another device. Answering 404 would make a retrying agent retry forever.
    if (!completed) {
      return { command: null };
    }

    await $recordEvent({
      projectId: device.projectId,
      deviceId: device.id,
      eventType: EndpointEventType.CommandCompleted,
      detail: {
        commandId: completed.id,
        command: completed.command,
        status,
        exitCode: completed.exitCode,
        requestedByEmail: completed.requestedByEmail
      }
    });

    return { command: $present({ ...completed, deviceName: device.name }) };
  };

  return {
    executeCommand,
    listCommands,
    getCommand,
    cancelCommand,
    claimCommands,
    reportCommandResult
  };
};
