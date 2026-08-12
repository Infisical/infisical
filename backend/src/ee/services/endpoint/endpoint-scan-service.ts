import { randomUUID } from "crypto";

import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import { TEndpointDeviceDALFactory } from "./endpoint-device-dal";
import { TEndpointProjectResolverFactory } from "./endpoint-project-resolver";
import {
  TEndpointDeviceScanDALFactory,
  TEndpointScanPolicyDALFactory,
  TEndpointSecretFindingDALFactory
} from "./endpoint-scan-dal";
import { EndpointSecretFindingStatus } from "./endpoint-scan-enums";
import {
  TListEndpointSecretFindingsDTO,
  TReportEndpointScanResultDTO,
  TRequestEndpointScanDTO,
  TUpdateEndpointScanPolicyDTO
} from "./endpoint-scan-types";

type TEndpointScanServiceFactoryDep = {
  endpointScanPolicyDAL: TEndpointScanPolicyDALFactory;
  endpointDeviceScanDAL: TEndpointDeviceScanDALFactory;
  endpointSecretFindingDAL: TEndpointSecretFindingDALFactory;
  endpointDeviceDAL: TEndpointDeviceDALFactory;
  endpointProjectResolver: TEndpointProjectResolverFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TEndpointScanServiceFactory = ReturnType<typeof endpointScanServiceFactory>;

// Secret scanning is a separate service from the network-policy one on purpose. The two subsystems
// share only the device and the project, so keeping them apart means neither can break the other, and
// they can be built in parallel.
export const endpointScanServiceFactory = ({
  endpointScanPolicyDAL,
  endpointDeviceScanDAL,
  endpointSecretFindingDAL,
  endpointDeviceDAL,
  endpointProjectResolver,
  permissionService
}: TEndpointScanServiceFactoryDep) => {
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

  // Absent policy means scanning was never configured, which is not an error and must not read as one.
  // Disabled with no roots is exactly what the agent needs to see to do nothing.
  const $policyFor = async (projectId: string) => {
    const policy = await endpointScanPolicyDAL.findOne({ projectId });

    return {
      isEnabled: policy?.isEnabled ?? false,
      roots: (policy?.roots as string[] | undefined) ?? [],
      excludePatterns: (policy?.excludePatterns as string[] | undefined) ?? [],
      maxFileMegabytes: policy?.maxFileMegabytes ?? null,
      intervalHours: policy?.intervalHours ?? 24
    };
  };

  const getScanPolicy = async (actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);
    return { policy: await $policyFor(projectId) };
  };

  const updateScanPolicy = async (dto: TUpdateEndpointScanPolicyDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Edit);

    // Enabling with no roots would look configured while scanning nothing, which is the most confusing
    // possible state for the person who just turned it on.
    if (dto.isEnabled && !dto.roots.length) {
      throw new BadRequestError({
        message: "Add at least one folder to scan before turning scanning on."
      });
    }

    await endpointScanPolicyDAL.upsert(
      [
        {
          projectId,
          isEnabled: dto.isEnabled,
          roots: JSON.stringify(dto.roots),
          excludePatterns: JSON.stringify(dto.excludePatterns),
          maxFileMegabytes: dto.maxFileMegabytes ?? null,
          intervalHours: dto.intervalHours
        }
      ],
      ["projectId"]
    );

    return { policy: await $policyFor(projectId) };
  };

  const listFindings = async ({ deviceId }: TListEndpointSecretFindingsDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);
    const findings = await endpointSecretFindingDAL.findByProject({ projectId, deviceId });

    return { findings };
  };

  const listDeviceScans = async (actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Read);
    const deviceScans = await endpointDeviceScanDAL.findByProject({ projectId });

    return { deviceScans };
  };

  // "Scan now" is just a new request id. The agent is already polling the policy, so it picks this up on
  // its next tick without the backend needing a channel to the device.
  const requestScan = async ({ deviceId }: TRequestEndpointScanDTO, actor: OrgServiceActor) => {
    const projectId = await $authorizeProject(actor, ProjectPermissionActions.Edit);

    const device = await endpointDeviceDAL.findOne({ id: deviceId, projectId });
    if (!device) {
      throw new NotFoundError({ message: `Device with ID '${deviceId}' not found` });
    }

    const policy = await $policyFor(projectId);
    if (!policy.isEnabled || !policy.roots.length) {
      throw new BadRequestError({
        message: "Turn on secret scanning and choose at least one folder before requesting a scan."
      });
    }

    const scanRequestId = randomUUID();

    const [deviceScan] = await endpointDeviceScanDAL.upsert(
      [{ deviceId, scanRequestId, requestedAt: new Date() }],
      ["deviceId"],
      undefined,
      ["scanRequestId", "requestedAt"]
    );

    return { deviceScan };
  };

  const getAgentScanPolicy = async (actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);
    const policy = await $policyFor(device.projectId);
    const deviceScan = await endpointDeviceScanDAL.findOne({ deviceId: device.id });

    return {
      policy: {
        enabled: policy.isEnabled,
        roots: policy.roots,
        excludePatterns: policy.excludePatterns,
        maxFileMegabytes: policy.maxFileMegabytes ?? 0,
        intervalHours: policy.intervalHours,
        scanRequestId: deviceScan?.scanRequestId ?? ""
      }
    };
  };

  const reportScanResult = async ({ result }: TReportEndpointScanResultDTO, actor: OrgServiceActor) => {
    const device = await $resolveDeviceForAgent(actor);

    const scanStartedAt = new Date(result.startedAt);
    const lastSeenAt = new Date();

    if (result.findings.length) {
      await endpointSecretFindingDAL.upsert(
        result.findings.map((finding) => ({
          projectId: device.projectId,
          deviceId: device.id,
          fingerprint: finding.fingerprint,
          ruleId: finding.ruleId,
          description: finding.description ?? null,
          file: finding.file,
          startLine: finding.startLine,
          entropy: finding.entropy ?? null,
          redactedMatch: finding.redactedMatch ?? null,
          fileModifiedAt: finding.fileModifiedAt ? new Date(finding.fileModifiedAt) : null,
          status: EndpointSecretFindingStatus.Open,
          firstSeenAt: lastSeenAt,
          lastSeenAt
        })),
        ["deviceId", "fingerprint"],
        undefined,
        // firstSeenAt is deliberately absent from the merge list: a finding that has been on the device
        // for a month should still say so after the next scan re-reports it. status is present, so a
        // credential that comes back reopens rather than staying resolved.
        [
          "ruleId",
          "description",
          "file",
          "startLine",
          "entropy",
          "redactedMatch",
          "fileModifiedAt",
          "status",
          "lastSeenAt"
        ]
      );
    }

    // Only the roots this scan could actually read. Roots macOS blocked are excluded, so a blocked scan
    // cannot resolve findings it never had the chance to look for.
    await endpointSecretFindingDAL.resolveMissingUnderRoots({
      deviceId: device.id,
      scanStartedAt,
      roots: result.rootsScanned
    });

    const [deviceScan] = await endpointDeviceScanDAL.upsert(
      [
        {
          deviceId: device.id,
          lastScanStartedAt: scanStartedAt,
          lastScanFinishedAt: new Date(result.finishedAt),
          lastTrigger: result.trigger,
          filesScanned: result.filesScanned,
          findingCount: result.findings.length,
          rootsScanned: JSON.stringify(result.rootsScanned),
          inaccessibleRoots: JSON.stringify(result.inaccessibleRoots ?? []),
          truncated: result.truncated
        }
      ],
      ["deviceId"],
      undefined,
      [
        "lastScanStartedAt",
        "lastScanFinishedAt",
        "lastTrigger",
        "filesScanned",
        "findingCount",
        "rootsScanned",
        "inaccessibleRoots",
        "truncated"
      ]
    );

    return { acceptedCount: result.findings.length, deviceScan };
  };

  return {
    getScanPolicy,
    updateScanPolicy,
    listFindings,
    listDeviceScans,
    requestScan,
    getAgentScanPolicy,
    reportScanResult
  };
};
