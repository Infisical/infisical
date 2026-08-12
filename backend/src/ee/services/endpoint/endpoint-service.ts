import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { ENDPOINT_AGENT_POLL_INTERVAL_SECONDS, ENDPOINT_DEFAULT_TRANSFER_WINDOW_SECONDS } from "./endpoint-constants";
import { TEndpointCounterDALFactory } from "./endpoint-counter-dal";
import { TEndpointDeviceDALFactory } from "./endpoint-device-dal";
import {
  EndpointDestinationKind,
  EndpointDeviceStatus,
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType
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
import {
  TCreateEndpointNetworkRuleDTO,
  TDeleteEndpointDeviceDTO,
  TDeleteEndpointNetworkRuleDTO,
  TEndpointHeartbeatDTO,
  TListEndpointCountersDTO,
  TListEndpointEventsDTO,
  TRegisterEndpointDeviceDTO,
  TReportEndpointEventsDTO,
  TUpdateEndpointNetworkRuleDTO
} from "./endpoint-types";

type TEndpointServiceFactoryDep = {
  endpointDeviceDAL: TEndpointDeviceDALFactory;
  endpointNetworkRuleDAL: TEndpointNetworkRuleDALFactory;
  endpointCounterDAL: TEndpointCounterDALFactory;
  endpointEventDAL: TEndpointEventDALFactory;
  endpointProjectResolver: TEndpointProjectResolverFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TEndpointServiceFactory = ReturnType<typeof endpointServiceFactory>;

export const endpointServiceFactory = ({
  endpointDeviceDAL,
  endpointNetworkRuleDAL,
  endpointCounterDAL,
  endpointEventDAL,
  endpointProjectResolver,
  userDAL,
  membershipDAL,
  permissionService
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
          enabled: false,
          assignedCidrs: [] as string[],
          hostEntries: [] as { domain: string; ip: string }[],
          gateway: null
        }
      }
    };
  };

  // Deliberately transaction-free: a fleet heartbeating on a timer is the traffic shape most likely
  // to exhaust the connection pool, and neither write needs to be atomic with the other.
  const heartbeat = async (dto: TEndpointHeartbeatDTO, actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    const stampedDevice = await endpointDeviceDAL.stampHeartbeat(device.id, {
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

    return { device: { configVersion: stampedDevice.configVersion } };
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

    return { acceptedCount: inserted.length };
  };

  return {
    getProjectId,
    listDevices,
    listCounters,
    registerDevice,
    deleteDevice,
    listNetworkRules,
    createNetworkRule,
    updateNetworkRule,
    deleteNetworkRule,
    listEvents,
    getAgentConfig,
    heartbeat,
    reportEvents
  };
};
