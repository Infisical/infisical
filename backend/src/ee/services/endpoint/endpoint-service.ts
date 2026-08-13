import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType } from "@app/db/schemas";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAlertQueueServiceFactory } from "@app/services/alert/alert-queue";
import { ENDPOINT_TRANSFER_VIOLATION_RESOURCE_TYPE } from "@app/services/alert/providers/endpoint-transfer-violation-alert-provider";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import {
  ENDPOINT_AGENT_POLL_INTERVAL_SECONDS,
  ENDPOINT_DEFAULT_TRANSFER_WINDOW_SECONDS,
  ENDPOINT_LOOPBACK_FIRST_OCTET,
  ENDPOINT_LOOPBACK_LAST_OCTET,
  ENDPOINT_LOOPBACK_PREFIX,
  ENDPOINT_TRANSFER_BUCKET_SECONDS
} from "./endpoint-constants";
import { TEndpointCounterDALFactory } from "./endpoint-counter-dal";
import { TEndpointDeviceAppDALFactory } from "./endpoint-device-app-dal";
import { TEndpointDeviceDALFactory } from "./endpoint-device-dal";
import {
  EndpointDestinationKind,
  EndpointDeviceAppSource,
  EndpointDeviceStatus,
  EndpointEventType,
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType,
  EndpointTargetKind
} from "./endpoint-enums";
import { TEndpointEventDALFactory } from "./endpoint-event-dal";
import {
  decodeEndpointEventCursor,
  encodeEndpointEventCursor,
  isEndpointDeviceOnline,
  toEndpointDeviceOwner,
  toEndpointDeviceResponse,
  toEndpointEventResponse,
  toEndpointNetworkRuleResponse
} from "./endpoint-fns";
import { TEndpointNetworkRuleDALFactory } from "./endpoint-network-rule-dal";
import { TEndpointProjectResolverFactory } from "./endpoint-project-resolver";
import { TEndpointTargetAssignmentDALFactory } from "./endpoint-target-assignment-dal";
import { TEndpointTargetDALFactory } from "./endpoint-target-dal";
import { TEndpointTransferDALFactory } from "./endpoint-transfer-dal";
import {
  TConnectEndpointTargetDTO,
  TCreateEndpointNetworkRuleDTO,
  TCreateEndpointTargetDTO,
  TDeleteEndpointDeviceDTO,
  TDeleteEndpointNetworkRuleDTO,
  TDeleteEndpointTargetDTO,
  TEndpointHeartbeatDTO,
  TListEndpointCountersDTO,
  TListEndpointDeviceAppsDTO,
  TListEndpointEventsDTO,
  TListEndpointTransferHistoryDTO,
  TRegisterEndpointDeviceDTO,
  TReportEndpointDeviceAppsDTO,
  TReportEndpointEventsDTO,
  TUpdateEndpointNetworkRuleDTO,
  TUpdateEndpointTargetDTO
} from "./endpoint-types";

type TEndpointServiceFactoryDep = {
  endpointDeviceDAL: TEndpointDeviceDALFactory;
  endpointNetworkRuleDAL: TEndpointNetworkRuleDALFactory;
  endpointCounterDAL: TEndpointCounterDALFactory;
  endpointTransferDAL: TEndpointTransferDALFactory;
  endpointDeviceAppDAL: TEndpointDeviceAppDALFactory;
  endpointEventDAL: TEndpointEventDALFactory;
  endpointTargetDAL: TEndpointTargetDALFactory;
  endpointTargetAssignmentDAL: TEndpointTargetAssignmentDALFactory;
  endpointProjectResolver: TEndpointProjectResolverFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId" | "getGatewayById">;
  alertQueue: Pick<TAlertQueueServiceFactory, "enqueueAlertsForEvent">;
};

export type TEndpointServiceFactory = ReturnType<typeof endpointServiceFactory>;

export const endpointServiceFactory = ({
  endpointDeviceDAL,
  endpointNetworkRuleDAL,
  endpointCounterDAL,
  endpointTransferDAL,
  endpointDeviceAppDAL,
  endpointEventDAL,
  endpointTargetDAL,
  endpointTargetAssignmentDAL,
  endpointProjectResolver,
  userDAL,
  membershipDAL,
  permissionService,
  gatewayV2Service,
  alertQueue
}: TEndpointServiceFactoryDep) => {
  // There is one Endpoint project per organization, created on first use, so console callers never
  // pass a projectId and the product needs no create-project flow.
  const $authorizeProject = async (actor: OrgServiceActor, action: ProjectPermissionActions) => {
    const projectId = await endpointProjectResolver.resolve(actor.orgId);

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.Endpoint
    });

    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.Endpoint);

    return projectId;
  };

  // The agent authenticates as the person whose device it is, so the device is resolved from the
  // logged-in user rather than from an id the agent could otherwise choose. One device per person,
  // so the user alone identifies it.
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

  // The two rule types are different shapes, not one shape with optional fields. A destination rule
  // names where it applies; a volume rule deliberately names nothing, because a threshold is only
  // worth setting when it can catch a destination nobody thought to list.
  const $assertRuleShape = (dto: {
    ruleType: EndpointNetworkRuleType;
    action?: EndpointNetworkRuleAction;
    kind?: EndpointDestinationKind;
    destination?: string;
    thresholdBytes?: number;
    windowSeconds?: number;
  }) => {
    if (dto.ruleType === EndpointNetworkRuleType.Destination) {
      if (!dto.action) {
        throw new BadRequestError({ message: "A destination rule needs an 'action' of either 'deny' or 'allow'." });
      }
      if (!dto.kind || !dto.destination) {
        throw new BadRequestError({
          message: "A destination rule needs a 'destination' and the 'kind' that says how to read it."
        });
      }
      if (dto.thresholdBytes !== undefined || dto.windowSeconds !== undefined) {
        throw new BadRequestError({
          message:
            "'thresholdBytes' and 'windowSeconds' only apply to volume rules. Remove them, or create a volume rule instead."
        });
      }
      return;
    }

    if (dto.thresholdBytes === undefined) {
      throw new BadRequestError({ message: "A volume rule needs a 'thresholdBytes' transfer threshold." });
    }
    if (dto.windowSeconds === undefined) {
      throw new BadRequestError({
        message:
          "A volume rule needs a 'windowSeconds' window, because the threshold is a rate: that many bytes within that many seconds."
      });
    }
    if (dto.action) {
      throw new BadRequestError({
        message:
          "'action' only applies to destination rules. A volume rule always blocks once its threshold is crossed."
      });
    }
    if (dto.kind || dto.destination) {
      throw new BadRequestError({
        message:
          "A volume rule applies to every destination, so it takes no 'destination' or 'kind'. It blocks whichever destination a device sends more than the threshold to. To cap traffic to one destination you already know, create a destination rule instead."
      });
    }
  };

  // The console needs the resolved project id to load the project permission context, since the
  // Endpoint URLs are org-scoped and never carry it.
  const getProjectId = async (actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);
    return { projectId };
  };

  const listDevices = async (actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    const devices = await endpointDeviceDAL.findByProjectWithOwner(projectId);

    return devices.map((device) => ({
      ...toEndpointDeviceResponse(device),
      owner: toEndpointDeviceOwner(device),
      isOnline: isEndpointDeviceOnline(device.lastSeenAt)
    }));
  };

  const registerDevice = async ({ userId, name }: TRegisterEndpointDeviceDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Create);

    const user = await userDAL.findById(userId);
    if (!user) {
      throw new NotFoundError({ message: `User with ID '${userId}' not found.` });
    }

    // A device owner has to be someone in this organization, or the console would show a device
    // belonging to a person nobody here can see.
    const orgMembership = await membershipDAL.findOne({
      scope: AccessScope.Organization,
      scopeOrgId: actor.orgId,
      actorUserId: userId,
      isActive: true
    });
    if (!orgMembership) {
      throw new NotFoundError({
        message: `'${user.email ?? user.username}' is not a member of this organization.`
      });
    }

    const existingDevice = await endpointDeviceDAL.findOne({ projectId, userId });
    if (existingDevice) {
      throw new BadRequestError({
        message: `'${user.email ?? user.username}' already has the device '${existingDevice.name}' registered. Remove it before registering another.`
      });
    }

    const device = await endpointDeviceDAL.create({
      projectId,
      userId,
      name,
      status: EndpointDeviceStatus.Active
    });

    return {
      ...toEndpointDeviceResponse(device),
      owner: toEndpointDeviceOwner({
        userId,
        userEmail: user.email,
        username: user.username,
        userFirstName: user.firstName,
        userLastName: user.lastName
      }),
      isOnline: false
    };
  };

  const deleteDevice = async ({ deviceId }: TDeleteEndpointDeviceDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Delete);

    const device = await endpointDeviceDAL.findOne({ id: deviceId, projectId });
    if (!device) {
      throw new NotFoundError({ message: `Endpoint device with ID '${deviceId}' not found.` });
    }

    await endpointDeviceDAL.deleteById(deviceId);

    return toEndpointDeviceResponse(device);
  };

  // What the console's live transfer counter reads. The numbers are whatever the agent last
  // reported on its heartbeat, which is the same tally that decides whether a rule has tripped.
  const listCounters = async ({ deviceId }: TListEndpointCountersDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    return endpointCounterDAL.findByProject({ projectId, deviceId });
  };

  // Where the device's traffic actually went, kept after the live counter has cleared. A counter only
  // exists while a destination is close to tripping a rule and disappears the moment the transfer
  // stops, which leaves the console unable to answer the question an admin asks afterwards: who did
  // this machine talk to, and how much did it send.
  const listTransferHistory = async (
    { deviceId, lookbackHours, limit }: TListEndpointTransferHistoryDTO,
    actor: OrgServiceActor
  ) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    const history = await endpointTransferDAL.findHistoryByDevice({ projectId, deviceId, since, limit });

    return {
      transfers: history.map(({ activeBuckets, ...entry }) => ({
        ...entry,
        // A peak is only a rate if the span it was measured over travels with it, and the console
        // should not have to know how wide a bucket is to say "per minute".
        bucketSeconds: ENDPOINT_TRANSFER_BUCKET_SECONDS,
        activeSeconds: activeBuckets * ENDPOINT_TRANSFER_BUCKET_SECONDS
      })),
      lookbackHours
    };
  };

  const listNetworkRules = async (actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    const rules = await endpointNetworkRuleDAL.find({ projectId }, { sort: [["createdAt", "desc"]] });

    return rules.map(toEndpointNetworkRuleResponse);
  };

  const createNetworkRule = async (dto: TCreateEndpointNetworkRuleDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Create);
    $assertRuleShape(dto);

    return endpointNetworkRuleDAL.transaction(async (tx) => {
      const rule = await endpointNetworkRuleDAL.create(
        {
          projectId,
          ruleType: dto.ruleType,
          name: dto.name,
          kind: dto.kind ?? null,
          destination: dto.destination ?? null,
          action: dto.action,
          thresholdBytes: dto.thresholdBytes,
          windowSeconds: dto.windowSeconds,
          isEnabled: dto.isEnabled ?? true
        },
        tx
      );

      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);

      return toEndpointNetworkRuleResponse(rule);
    });
  };

  const updateNetworkRule = async ({ ruleId, ...dto }: TUpdateEndpointNetworkRuleDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Edit);

    const rule = await endpointNetworkRuleDAL.findOne({ id: ruleId, projectId });
    if (!rule) {
      throw new NotFoundError({ message: `Network rule with ID '${ruleId}' not found.` });
    }

    $assertRuleShape({
      ruleType: rule.ruleType as EndpointNetworkRuleType,
      action: (dto.action ?? rule.action ?? undefined) as EndpointNetworkRuleAction | undefined,
      kind: (dto.kind ?? rule.kind ?? undefined) as EndpointDestinationKind | undefined,
      destination: dto.destination ?? rule.destination ?? undefined,
      thresholdBytes: dto.thresholdBytes ?? rule.thresholdBytes ?? undefined,
      windowSeconds: dto.windowSeconds ?? rule.windowSeconds ?? undefined
    });

    return endpointNetworkRuleDAL.transaction(async (tx) => {
      const updatedRule = await endpointNetworkRuleDAL.updateById(ruleId, dto, tx);

      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);

      return toEndpointNetworkRuleResponse(updatedRule);
    });
  };

  const deleteNetworkRule = async ({ ruleId }: TDeleteEndpointNetworkRuleDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Delete);

    const rule = await endpointNetworkRuleDAL.findOne({ id: ruleId, projectId });
    if (!rule) {
      throw new NotFoundError({ message: `Network rule with ID '${ruleId}' not found.` });
    }

    return endpointNetworkRuleDAL.transaction(async (tx) => {
      await endpointNetworkRuleDAL.deleteById(ruleId, tx);
      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);

      return toEndpointNetworkRuleResponse(rule);
    });
  };

  // A gateway is an organization-level resource and a target names one by id, so the id has to be
  // checked against the caller's own organization. Without this an id from another organization
  // would be stored and only fail much later, on the device, as a tunnel that never connects.
  const $assertGatewayInOrg = async (gatewayId: string, orgId: string) => {
    const gateway = await gatewayV2Service.getGatewayById({ gatewayId });
    if (gateway.orgId !== orgId) {
      throw new NotFoundError({ message: `Gateway with ID '${gatewayId}' not found.` });
    }
  };

  // A domain target is reached through an address the device claims on its loopback interface and
  // maps the domain onto. The address is allocated per destination rather than per target, so a host
  // published on two ports gets one /etc/hosts entry instead of two that contradict each other.
  const $resolveLoopbackIp = async ({
    projectId,
    kind,
    destination,
    tx
  }: {
    projectId: string;
    kind: EndpointTargetKind;
    destination: string;
    tx?: Parameters<Parameters<typeof endpointTargetDAL.transaction>[0]>[0];
  }) => {
    // An IP target claims the destination address itself, so there is nothing to allocate.
    if (kind !== EndpointTargetKind.Domain) return null;

    const targets = await endpointTargetDAL.find({ projectId }, { tx });

    const sharing = targets.find((target) => target.destination === destination && target.loopbackIp);
    if (sharing) return sharing.loopbackIp;

    const taken = new Set(targets.map((target) => target.loopbackIp).filter(Boolean));
    for (let octet = ENDPOINT_LOOPBACK_FIRST_OCTET; octet <= ENDPOINT_LOOPBACK_LAST_OCTET; octet += 1) {
      const candidate = `${ENDPOINT_LOOPBACK_PREFIX}${octet}`;
      if (!taken.has(candidate)) return candidate;
    }

    throw new BadRequestError({
      message: `This project already uses every available loopback address (${ENDPOINT_LOOPBACK_PREFIX}${ENDPOINT_LOOPBACK_FIRST_OCTET}-${ENDPOINT_LOOPBACK_PREFIX}${ENDPOINT_LOOPBACK_LAST_OCTET}). Delete a target you no longer need.`
    });
  };

  // Assignments are replaced wholesale rather than diffed: the console edits them as a set, and a
  // partial update would leave a device granted access it was just removed from.
  const $replaceAssignments = async ({
    targetId,
    deviceIds,
    projectId,
    tx
  }: {
    targetId: string;
    deviceIds: string[];
    projectId: string;
    tx: Parameters<Parameters<typeof endpointTargetDAL.transaction>[0]>[0];
  }) => {
    const unique = [...new Set(deviceIds)];

    if (unique.length) {
      const devices = await endpointDeviceDAL.find({ projectId }, { tx });
      const known = new Set(devices.map((device) => device.id));

      const unknown = unique.find((deviceId) => !known.has(deviceId));
      if (unknown) {
        throw new NotFoundError({ message: `Endpoint device with ID '${unknown}' not found.` });
      }
    }

    await endpointTargetAssignmentDAL.delete({ targetId }, tx);

    if (unique.length) {
      await endpointTargetAssignmentDAL.insertMany(
        unique.map((deviceId) => ({ targetId, deviceId })),
        tx
      );
    }
  };

  const $attachAssignments = async (targets: Awaited<ReturnType<typeof endpointTargetDAL.findByProjectWithGateway>>) => {
    const assignments = await endpointTargetAssignmentDAL.findByTargetIdsWithDevice(
      targets.map((target) => target.id)
    );

    return targets.map((target) => ({
      ...target,
      kind: target.kind as EndpointTargetKind,
      assignments: assignments
        .filter((assignment) => assignment.targetId === target.id)
        .map((assignment) => ({ deviceId: assignment.deviceId, deviceName: assignment.deviceName }))
    }));
  };

  const listTargets = async (actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    const targets = await endpointTargetDAL.findByProjectWithGateway(projectId);

    return $attachAssignments(targets);
  };

  const $targetResponse = async (targetId: string, projectId: string) => {
    const targets = await endpointTargetDAL.findByProjectWithGateway(projectId);
    const [response] = await $attachAssignments(targets.filter((candidate) => candidate.id === targetId));

    return response;
  };

  // Both ends are re-read against the project rather than trusted from the path, so a device or a
  // target from another org reads as missing instead of being quietly linked across a tenant.
  const $resolveGrantPair = async ({
    deviceId,
    targetId,
    projectId
  }: {
    deviceId: string;
    targetId: string;
    projectId: string;
  }) => {
    const device = await endpointDeviceDAL.findOne({ id: deviceId, projectId });
    if (!device) {
      throw new NotFoundError({ message: `Endpoint device with ID '${deviceId}' not found.` });
    }

    const target = await endpointTargetDAL.findOne({ id: targetId, projectId });
    if (!target) {
      throw new NotFoundError({ message: `Endpoint target with ID '${targetId}' not found.` });
    }

    return { device, target };
  };

  // Granting one device at a time, rather than through the target's whole device list. The console
  // manages access from the device, so a read-modify-write of every other device's grant would be
  // both unnecessary and a race between two admins editing different devices.
  const grantDeviceTargetAccess = async (
    { deviceId, targetId }: { deviceId: string; targetId: string },
    actor: OrgServiceActor
  ) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Edit);
    await $resolveGrantPair({ deviceId, targetId, projectId });

    await endpointTargetDAL.transaction(async (tx) => {
      await endpointTargetAssignmentDAL.grantIfAbsent({ targetId, deviceId }, tx);

      // What a device may reach is part of the config it polls, so the grant does not reach the
      // agent until this moves.
      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);
    });

    return $targetResponse(targetId, projectId);
  };

  const revokeDeviceTargetAccess = async (
    { deviceId, targetId }: { deviceId: string; targetId: string },
    actor: OrgServiceActor
  ) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Edit);
    await $resolveGrantPair({ deviceId, targetId, projectId });

    await endpointTargetDAL.transaction(async (tx) => {
      // Also idempotent: revoking a grant that is already gone leaves the caller where they wanted
      // to be, so it is not an error.
      await endpointTargetAssignmentDAL.delete({ targetId, deviceId }, tx);
      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);
    });

    return $targetResponse(targetId, projectId);
  };

  // The table rejects a duplicate address and port too, but a raw constraint violation reaches the
  // console as a 500 with nothing an admin can act on. This says which target already has it.
  const $assertAddressIsFree = async ({
    projectId,
    destination,
    port,
    excludeTargetId
  }: {
    projectId: string;
    destination: string;
    port: number;
    excludeTargetId?: string;
  }) => {
    const clashing = await endpointTargetDAL.findOne({ projectId, destination, port });
    if (clashing && clashing.id !== excludeTargetId) {
      throw new BadRequestError({
        message: `The target '${clashing.name}' already publishes ${destination}:${port}. Two targets cannot share one address and port.`
      });
    }
  };

  const createTarget = async (dto: TCreateEndpointTargetDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Create);

    await $assertGatewayInOrg(dto.gatewayId, actor.orgId);
    await $assertAddressIsFree({ projectId, destination: dto.destination, port: dto.port });

    const target = await endpointTargetDAL.transaction(async (tx) => {
      const loopbackIp = await $resolveLoopbackIp({ projectId, kind: dto.kind, destination: dto.destination, tx });

      const created = await endpointTargetDAL.create(
        {
          projectId,
          name: dto.name,
          kind: dto.kind,
          destination: dto.destination,
          ip: dto.ip ?? null,
          port: dto.port,
          loopbackIp,
          gatewayId: dto.gatewayId,
          isEnabled: dto.isEnabled ?? true
        },
        tx
      );

      await $replaceAssignments({ targetId: created.id, deviceIds: dto.deviceIds ?? [], projectId, tx });

      // Both the target and its assignments are part of what a device is allowed to reach, so both
      // have to bump the version the agent polls, or the grant never leaves the console.
      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);

      return created;
    });

    const [withGateway] = await endpointTargetDAL.findByProjectWithGateway(projectId).then((targets) =>
      targets.filter((candidate) => candidate.id === target.id)
    );

    const [response] = await $attachAssignments([withGateway]);
    return response;
  };

  const updateTarget = async ({ targetId, ...dto }: TUpdateEndpointTargetDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Edit);

    const target = await endpointTargetDAL.findOne({ id: targetId, projectId });
    if (!target) {
      throw new NotFoundError({ message: `Endpoint target with ID '${targetId}' not found.` });
    }

    if (dto.gatewayId) {
      await $assertGatewayInOrg(dto.gatewayId, actor.orgId);
    }

    if (dto.destination !== undefined || dto.port !== undefined) {
      await $assertAddressIsFree({
        projectId,
        destination: dto.destination ?? target.destination,
        port: dto.port ?? target.port,
        excludeTargetId: targetId
      });
    }

    await endpointTargetDAL.transaction(async (tx) => {
      const kind = (dto.kind ?? target.kind) as EndpointTargetKind;
      const destination = dto.destination ?? target.destination;

      // The address the device listens on follows the destination, so a change to either has to
      // re-allocate it. Leaving a stale loopback address behind would point /etc/hosts at a listener
      // for a different service.
      const loopbackIp =
        kind === target.kind && destination === target.destination
          ? target.loopbackIp
          : await $resolveLoopbackIp({ projectId, kind, destination, tx });

      await endpointTargetDAL.updateById(
        targetId,
        {
          name: dto.name,
          kind: dto.kind,
          destination: dto.destination,
          ip: dto.ip === undefined ? undefined : dto.ip,
          port: dto.port,
          gatewayId: dto.gatewayId,
          isEnabled: dto.isEnabled,
          loopbackIp
        },
        tx
      );

      if (dto.deviceIds) {
        await $replaceAssignments({ targetId, deviceIds: dto.deviceIds, projectId, tx });
      }

      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);
    });

    const updated = await endpointTargetDAL
      .findByProjectWithGateway(projectId)
      .then((targets) => targets.filter((candidate) => candidate.id === targetId));

    const [response] = await $attachAssignments(updated);
    return response;
  };

  const deleteTarget = async ({ targetId }: TDeleteEndpointTargetDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Delete);

    const target = await endpointTargetDAL.findOne({ id: targetId, projectId });
    if (!target) {
      throw new NotFoundError({ message: `Endpoint target with ID '${targetId}' not found.` });
    }

    return endpointTargetDAL.transaction(async (tx) => {
      await endpointTargetDAL.deleteById(targetId, tx);
      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);

      return { ...target, kind: target.kind as EndpointTargetKind, assignments: [] };
    });
  };

  // What the agent calls each time something on the device opens a connection to a private target.
  // It mints a client certificate stamped with where the gateway should dial; the certificate lives
  // five minutes, which is why this is per connection rather than per target.
  const connectTarget = async ({ targetId }: TConnectEndpointTargetDTO, actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    const target = await endpointTargetDAL.findAssignedToDeviceById({ deviceId: device.id, targetId });

    // Not assigned and does not exist are the same answer on purpose: a device must not be able to
    // discover which targets exist by probing ids.
    if (!target) {
      throw new NotFoundError({ message: `Endpoint target with ID '${targetId}' is not assigned to this device.` });
    }

    if (!target.isEnabled) {
      throw new BadRequestError({ message: `Endpoint target '${target.name}' is disabled.` });
    }

    if (!target.gatewayId) {
      throw new BadRequestError({
        message: `Endpoint target '${target.name}' has no gateway, so there is nothing to reach it through.`
      });
    }

    // A domain target's 'ip' is where the gateway dials when its own DNS cannot resolve the name the
    // device uses. An IP target is already an address.
    const targetHost = target.kind === EndpointTargetKind.Ip ? target.destination : target.ip || target.destination;

    const connectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId: target.gatewayId,
      targetHost,
      targetPort: target.port
    });

    if (!connectionDetails) {
      throw new NotFoundError({ message: `Gateway for target '${target.name}' not found.` });
    }

    return connectionDetails;
  };

  const listEvents = async ({ limit, cursor, deviceId }: TListEndpointEventsDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    const events = await endpointEventDAL.findFeedByProject({
      projectId,
      deviceId,
      limit: limit + 1,
      cursor: cursor ? decodeEndpointEventCursor(cursor) : undefined
    });

    const page = events.slice(0, limit);
    const nextCursor = events.length > limit && page.length ? encodeEndpointEventCursor(page[page.length - 1]) : null;

    return { events: page.map(toEndpointEventResponse), nextCursor };
  };

  const getAgentConfig = async (actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    const rules = await endpointNetworkRuleDAL.find({ projectId: device.projectId, isEnabled: true });
    const targets = await endpointTargetDAL.findAssignedToDevice(device.id);

    // One entry per target, each naming the address the device listens on for it. A domain target
    // also carries the name to map onto that address; an IP target claims its own address, so it has
    // no domain and needs no /etc/hosts entry.
    const hostEntries = targets.map((target) => ({
      targetId: target.id,
      name: target.name,
      kind: target.kind as EndpointTargetKind,
      domain: target.kind === EndpointTargetKind.Domain ? target.destination : "",
      ip: (target.kind === EndpointTargetKind.Domain ? target.loopbackIp : target.destination) as string,
      port: target.port
    }));

    return {
      config: {
        device: { id: device.id, name: device.name, status: device.status as EndpointDeviceStatus },
        configVersion: device.configVersion,
        pollIntervalSeconds: ENDPOINT_AGENT_POLL_INTERVAL_SECONDS,
        networkPolicy: {
          enabled: device.status === EndpointDeviceStatus.Active,
          destinationRules: rules
            .filter(
              (rule) => rule.ruleType === EndpointNetworkRuleType.Destination && rule.kind && rule.destination
            )
            .map((rule) => ({
              id: rule.id,
              action: (rule.action ?? EndpointNetworkRuleAction.Deny) as EndpointNetworkRuleAction,
              kind: rule.kind as EndpointDestinationKind,
              destination: rule.destination as string,
              name: rule.name
            })),
          // No destination and no kind: a volume rule means "block any destination this device sends
          // more than thresholdBytes to within windowSeconds", and which destinations those are is only
          // known on the device, from its own traffic.
          volumeRules: rules
            .filter((rule) => rule.ruleType === EndpointNetworkRuleType.Volume)
            .map((rule) => ({
              id: rule.id,
              // thresholdBytes is a bigint, which pg returns as a string even though the generated
              // schema types it as a number. Without this the agent's config response fails its own
              // validation and every poll 500s.
              thresholdBytes: Number(rule.thresholdBytes ?? 0),
              windowSeconds: rule.windowSeconds ?? ENDPOINT_DEFAULT_TRANSFER_WINDOW_SECONDS,
              name: rule.name
            }))
        },
        privateAccess: {
          enabled: hostEntries.length > 0,
          // A CIDR target needs a TUN device, split-tunnel routing and DNS interception on the
          // agent. All three are roadmap, so this stays empty rather than promising a grant the
          // device cannot honour.
          assignedCidrs: [] as string[],
          hostEntries,
          gateway: null
        }
      }
    };
  };

  // Deliberately transaction-free: a fleet heartbeating on a timer is the traffic shape most likely
  // to exhaust the connection pool, and neither write needs to be atomic with the other.
  const heartbeat = async (dto: TEndpointHeartbeatDTO, actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    // Only written when the agent actually sent it. Spreading an undefined field would blank a fact
    // the device reported earlier, so the machine would appear to forget its own serial number
    // between heartbeats.
    const systemInfo = dto.device
      ? {
          ...dto.device,
          bootedAt: dto.device.bootedAt ? new Date(dto.device.bootedAt) : null,
          systemInfoReportedAt: new Date()
        }
      : undefined;

    const stampedDevice = await endpointDeviceDAL.stampHeartbeat(device.id, {
      systemInfo,
      lastSeenAt: new Date(),
      agentVersion: dto.agentVersion,
      pfEnabled: dto.enforcement.pfEnabled,
      blockedAddresses: dto.enforcement.blockedAddresses
    });

    const reportedAt = new Date();

    if (dto.counters.length) {
      const knownRuleIds = new Set(
        (await endpointNetworkRuleDAL.find({ projectId: device.projectId })).map((rule) => rule.id)
      );

      const counters = dto.counters
        .filter((counter) => knownRuleIds.has(counter.volumeRuleId))
        .map((counter) => ({
          deviceId: device.id,
          networkRuleId: counter.volumeRuleId,
          destination: counter.destination,
          bytesOut: counter.bytesOut,
          thresholdBytes: counter.thresholdBytes,
          tripped: counter.tripped,
          reportedAt
        }));

      if (counters.length) {
        // One catch-all rule reports a counter per destination, so the destination is part of the
        // conflict key. Without it, every destination would overwrite the last one's row.
        await endpointCounterDAL.upsert(counters, ["deviceId", "networkRuleId", "destination"]);
      }
    }

    // The agent is authoritative about what it is measuring. Anything it did not report this time is
    // no longer being measured, so the console should stop showing it rather than freeze a stale bar.
    await endpointCounterDAL.deleteReportedBefore({ deviceId: device.id, reportedAt });

    if (dto.transfers?.length) {
      // Which destinations were cut off is only known from the counters, so the flag is carried over
      // rather than re-derived: history is where an admin looks to find out that a transfer was
      // stopped, long after the counter that stopped it has gone.
      const blockedDestinations = new Set(
        dto.counters.filter((counter) => counter.tripped).map((counter) => counter.destination)
      );

      // Banked against the minute the report landed in, not the minute the transfer began. The agent
      // reports every second or two, so the difference is bounded by that, and using the report time
      // keeps a device with a skewed clock from writing into a bucket that has already been read.
      const bucketMs = ENDPOINT_TRANSFER_BUCKET_SECONDS * 1000;
      const bucketStartedAt = new Date(Math.floor(reportedAt.getTime() / bucketMs) * bucketMs);

      await endpointTransferDAL.recordTransfers(
        dto.transfers.map((transfer) => ({
          deviceId: device.id,
          destination: transfer.destination,
          bucketStartedAt,
          bytesOut: transfer.bytesOut,
          seenAt: reportedAt,
          blocked: blockedDestinations.has(transfer.destination)
        }))
      );
    }

    return { device: { configVersion: stampedDevice.configVersion } };
  };

  // What is installed on the machine, replaced wholesale on each report. Deliberately not on the
  // heartbeat: an inventory is a few hundred rows that change on the order of days, and the heartbeat
  // is the highest-frequency call in the product.
  const reportDeviceApps = async (dto: TReportEndpointDeviceAppsDTO, actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    const reportedAt = new Date();

    // Two bundles cannot share an install path, but an agent that walked overlapping roots can still
    // report one twice, and the upsert would then fail on its own conflict key mid-statement.
    const byPath = new Map(dto.apps.map((app) => [app.path, app]));

    await endpointDeviceAppDAL.replaceForDevice(device.id, [...byPath.values()], reportedAt);

    // Stamped after the replace, so a failed write does not leave the console claiming an inventory
    // it does not have. An empty list is still a report: it means nothing is installed, which reads
    // very differently from never having run.
    await endpointDeviceDAL.updateById(device.id, { appsReportedAt: reportedAt });

    return { acceptedCount: byPath.size };
  };

  const listDeviceApps = async ({ deviceId }: TListEndpointDeviceAppsDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    const device = await endpointDeviceDAL.findOne({ id: deviceId, projectId });
    if (!device) {
      throw new NotFoundError({ message: `Endpoint device with ID '${deviceId}' not found.` });
    }

    const apps = await endpointDeviceAppDAL.findByDevice({ projectId, deviceId });

    return {
      apps: apps.map((app) => ({ ...app, source: app.source as EndpointDeviceAppSource })),
      // Null until the agent has reported once. The console needs to tell "nothing installed" apart
      // from "this device has never sent an inventory", and an empty array says both.
      reportedAt: device.appsReportedAt ?? null
    };
  };

  const reportEvents = async (dto: TReportEndpointEventsDTO, actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    // A rule the agent references may already have been deleted in the console. The event still
    // happened, so it is recorded with a null rule rather than rejected.
    const knownRuleIds = new Set(
      (await endpointNetworkRuleDAL.find({ projectId: device.projectId })).map((rule) => rule.id)
    );

    const inserted = await endpointEventDAL.insertIgnoringDuplicates(
      dto.events.map((event) => ({
        projectId: device.projectId,
        deviceId: device.id,
        eventType: event.type,
        occurredAt: new Date(event.occurredAt),
        destination: event.destination ?? null,
        networkRuleId: event.ruleId && knownRuleIds.has(event.ruleId) ? event.ruleId : null,
        detail: event.detail ? JSON.stringify(event.detail) : null,
        idempotencyKey: event.idempotencyKey
      }))
    );

    // Only the rows that actually landed: a replayed batch inserts nothing, and re-alerting on it
    // would mail an admin again about a violation they have already been told about.
    const trippedCount = inserted.filter(
      (event) => event.eventType === EndpointEventType.NetworkTransferThresholdTripped
    ).length;

    if (trippedCount) {
      // After the insert, never inside it, and deliberately not awaited into the response: the agent
      // is waiting on this call, and a slow queue must not hold up the report. A failure here loses
      // the immediate mail, not the violation — the daily sweep still finds the event.
      alertQueue
        .enqueueAlertsForEvent({
          resourceType: ENDPOINT_TRANSFER_VIOLATION_RESOURCE_TYPE,
          orgId: actor.orgId
        })
        .catch((err) =>
          logger.error(
            err,
            `Could not enqueue transfer violation alerts [deviceId=${device.id}] [orgId=${actor.orgId}]`
          )
        );
    }

    return { acceptedCount: inserted.length };
  };

  return {
    getProjectId,
    listDevices,
    listCounters,
    listTransferHistory,
    registerDevice,
    deleteDevice,
    listNetworkRules,
    createNetworkRule,
    updateNetworkRule,
    deleteNetworkRule,
    listTargets,
    createTarget,
    updateTarget,
    deleteTarget,
    grantDeviceTargetAccess,
    revokeDeviceTargetAccess,
    connectTarget,
    listEvents,
    getAgentConfig,
    heartbeat,
    reportEvents,
    reportDeviceApps,
    listDeviceApps
  };
};
