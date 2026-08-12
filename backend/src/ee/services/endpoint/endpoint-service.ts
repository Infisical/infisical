import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { ENDPOINT_AGENT_POLL_INTERVAL_SECONDS } from "./endpoint-constants";
import { TEndpointCounterDALFactory } from "./endpoint-counter-dal";
import { TEndpointDeviceDALFactory } from "./endpoint-device-dal";
import { TEndpointEgressRuleDALFactory } from "./endpoint-egress-rule-dal";
import {
  EndpointDestinationKind,
  EndpointDeviceStatus,
  EndpointEgressRuleAction,
  EndpointEgressRuleType
} from "./endpoint-enums";
import { TEndpointEventDALFactory } from "./endpoint-event-dal";
import {
  decodeEndpointEventCursor,
  encodeEndpointEventCursor,
  isEndpointDeviceOnline,
  toEndpointDeviceOwner,
  toEndpointDeviceResponse,
  toEndpointEgressRuleResponse,
  toEndpointEventResponse
} from "./endpoint-fns";
import { TEndpointProjectResolverFactory } from "./endpoint-project-resolver";
import {
  TCreateEndpointEgressRuleDTO,
  TDeleteEndpointDeviceDTO,
  TDeleteEndpointEgressRuleDTO,
  TEndpointHeartbeatDTO,
  TListEndpointEventsDTO,
  TRegisterEndpointDeviceDTO,
  TReportEndpointEventsDTO,
  TUpdateEndpointEgressRuleDTO
} from "./endpoint-types";

type TEndpointServiceFactoryDep = {
  endpointDeviceDAL: TEndpointDeviceDALFactory;
  endpointEgressRuleDAL: TEndpointEgressRuleDALFactory;
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
  endpointEgressRuleDAL,
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

  const $assertRuleShape = (dto: {
    ruleType: EndpointEgressRuleType;
    action?: EndpointEgressRuleAction;
    thresholdBytes?: number;
  }) => {
    if (dto.ruleType === EndpointEgressRuleType.Destination) {
      if (!dto.action) {
        throw new BadRequestError({ message: "A destination rule needs an 'action' of either 'deny' or 'allow'." });
      }
      if (dto.thresholdBytes !== undefined) {
        throw new BadRequestError({
          message: "'thresholdBytes' only applies to volume rules. Remove it, or create a volume rule instead."
        });
      }
      return;
    }

    if (dto.thresholdBytes === undefined) {
      throw new BadRequestError({ message: "A volume rule needs a 'thresholdBytes' transfer threshold." });
    }
    if (dto.action) {
      throw new BadRequestError({
        message:
          "'action' only applies to destination rules. A volume rule always blocks once its threshold is crossed."
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

  const listEgressRules = async (actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    const rules = await endpointEgressRuleDAL.find({ projectId }, { sort: [["createdAt", "desc"]] });

    return rules.map(toEndpointEgressRuleResponse);
  };

  const createEgressRule = async (dto: TCreateEndpointEgressRuleDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Create);
    $assertRuleShape(dto);

    return endpointEgressRuleDAL.transaction(async (tx) => {
      const rule = await endpointEgressRuleDAL.create(
        {
          projectId,
          ruleType: dto.ruleType,
          name: dto.name,
          kind: dto.kind,
          destination: dto.destination,
          action: dto.action,
          thresholdBytes: dto.thresholdBytes,
          isEnabled: dto.isEnabled ?? true
        },
        tx
      );

      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);

      return toEndpointEgressRuleResponse(rule);
    });
  };

  const updateEgressRule = async ({ ruleId, ...dto }: TUpdateEndpointEgressRuleDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Edit);

    const rule = await endpointEgressRuleDAL.findOne({ id: ruleId, projectId });
    if (!rule) {
      throw new NotFoundError({ message: `Egress rule with ID '${ruleId}' not found.` });
    }

    $assertRuleShape({
      ruleType: rule.ruleType as EndpointEgressRuleType,
      action: (dto.action ?? rule.action ?? undefined) as EndpointEgressRuleAction | undefined,
      thresholdBytes: dto.thresholdBytes ?? rule.thresholdBytes ?? undefined
    });

    return endpointEgressRuleDAL.transaction(async (tx) => {
      const updatedRule = await endpointEgressRuleDAL.updateById(ruleId, dto, tx);

      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);

      return toEndpointEgressRuleResponse(updatedRule);
    });
  };

  const deleteEgressRule = async ({ ruleId }: TDeleteEndpointEgressRuleDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Delete);

    const rule = await endpointEgressRuleDAL.findOne({ id: ruleId, projectId });
    if (!rule) {
      throw new NotFoundError({ message: `Egress rule with ID '${ruleId}' not found.` });
    }

    return endpointEgressRuleDAL.transaction(async (tx) => {
      await endpointEgressRuleDAL.deleteById(ruleId, tx);
      await endpointDeviceDAL.bumpConfigVersionForProject(projectId, tx);

      return toEndpointEgressRuleResponse(rule);
    });
  };

  const listEvents = async ({ limit, cursor }: TListEndpointEventsDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);

    const events = await endpointEventDAL.findFeedByProject({
      projectId,
      limit: limit + 1,
      cursor: cursor ? decodeEndpointEventCursor(cursor) : undefined
    });

    const page = events.slice(0, limit);
    const nextCursor = events.length > limit && page.length ? encodeEndpointEventCursor(page[page.length - 1]) : null;

    return { events: page.map(toEndpointEventResponse), nextCursor };
  };

  const getAgentConfig = async (actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    const rules = await endpointEgressRuleDAL.find({ projectId: device.projectId, isEnabled: true });

    return {
      config: {
        device: { id: device.id, name: device.name, status: device.status as EndpointDeviceStatus },
        configVersion: device.configVersion,
        pollIntervalSeconds: ENDPOINT_AGENT_POLL_INTERVAL_SECONDS,
        egressPolicy: {
          enabled: device.status === EndpointDeviceStatus.Active,
          destinationRules: rules
            .filter((rule) => rule.ruleType === EndpointEgressRuleType.Destination)
            .map((rule) => ({
              id: rule.id,
              action: (rule.action ?? EndpointEgressRuleAction.Deny) as EndpointEgressRuleAction,
              kind: rule.kind as EndpointDestinationKind,
              destination: rule.destination,
              name: rule.name
            })),
          volumeRules: rules
            .filter((rule) => rule.ruleType === EndpointEgressRuleType.Volume)
            .map((rule) => ({
              id: rule.id,
              kind: rule.kind as EndpointDestinationKind,
              destination: rule.destination,
              thresholdBytes: rule.thresholdBytes ?? 0,
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

    if (dto.counters.length) {
      const knownRuleIds = new Set(
        (await endpointEgressRuleDAL.find({ projectId: device.projectId })).map((rule) => rule.id)
      );
      const reportedAt = new Date();

      const counters = dto.counters
        .filter((counter) => knownRuleIds.has(counter.volumeRuleId))
        .map((counter) => ({
          deviceId: device.id,
          egressRuleId: counter.volumeRuleId,
          destination: counter.destination,
          bytesOut: counter.bytesOut,
          thresholdBytes: counter.thresholdBytes,
          tripped: counter.tripped,
          reportedAt
        }));

      await endpointCounterDAL.upsert(counters, ["deviceId", "egressRuleId"]);
    }

    return { device: { configVersion: stampedDevice.configVersion } };
  };

  const reportEvents = async (dto: TReportEndpointEventsDTO, actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    // A rule the agent references may already have been deleted in the console. The event still
    // happened, so it is recorded with a null rule rather than rejected.
    const knownRuleIds = new Set(
      (await endpointEgressRuleDAL.find({ projectId: device.projectId })).map((rule) => rule.id)
    );

    const inserted = await endpointEventDAL.insertIgnoringDuplicates(
      dto.events.map((event) => ({
        projectId: device.projectId,
        deviceId: device.id,
        eventType: event.type,
        occurredAt: new Date(event.occurredAt),
        destination: event.destination ?? null,
        egressRuleId: event.ruleId && knownRuleIds.has(event.ruleId) ? event.ruleId : null,
        detail: event.detail ? JSON.stringify(event.detail) : null,
        idempotencyKey: event.idempotencyKey
      }))
    );

    return { acceptedCount: inserted.length };
  };

  return {
    getProjectId,
    listDevices,
    registerDevice,
    deleteDevice,
    listEgressRules,
    createEgressRule,
    updateEgressRule,
    deleteEgressRule,
    listEvents,
    getAgentConfig,
    heartbeat,
    reportEvents
  };
};
