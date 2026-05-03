import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TIdentityKubernetesAuthDALFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-dal";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TGatewayV2ConnectionDetails } from "../gateway-v2/gateway-v2-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPamDiscoverySourceDALFactory } from "../pam-discovery/pam-discovery-source-dal";
import { TPamDomainDALFactory } from "../pam-domain/pam-domain-dal";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { OrgPermissionGatewayPoolActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TPkiDiscoveryConfigDALFactory } from "../pki-discovery/pki-discovery-config-dal";
import { TGatewayPoolDALFactory } from "./gateway-pool-dal";
import { TGatewayPoolMembershipDALFactory } from "./gateway-pool-membership-dal";
import {
  TAddGatewayToPoolDTO,
  TCreateGatewayPoolDTO,
  TDeleteGatewayPoolDTO,
  TGetGatewayPoolByIdDTO,
  TGetPlatformConnectionDetailsByPoolIdDTO,
  TListGatewayPoolsDTO,
  TRemoveGatewayFromPoolDTO,
  TUpdateGatewayPoolDTO
} from "./gateway-pool-types";

type TGatewayPoolServiceFactoryDep = {
  gatewayPoolDAL: TGatewayPoolDALFactory;
  gatewayPoolMembershipDAL: TGatewayPoolMembershipDALFactory;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  identityKubernetesAuthDAL: Pick<TIdentityKubernetesAuthDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  pkiDiscoveryConfigDAL: Pick<TPkiDiscoveryConfigDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  pamDomainDAL: Pick<TPamDomainDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  pamDiscoverySourceDAL: Pick<TPamDiscoverySourceDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
};

export type TGatewayPoolServiceFactory = ReturnType<typeof gatewayPoolServiceFactory>;

export const gatewayPoolServiceFactory = ({
  gatewayPoolDAL,
  gatewayPoolMembershipDAL,
  gatewayV2DAL,
  gatewayV2Service,
  permissionService,
  licenseService,
  identityKubernetesAuthDAL,
  pkiDiscoveryConfigDAL,
  pamDomainDAL,
  pamResourceDAL,
  pamDiscoverySourceDAL,
  appConnectionDAL,
  dynamicSecretDAL
}: TGatewayPoolServiceFactoryDep) => {
  const $checkPermission = async (actor: OrgServiceActor, action: OrgPermissionGatewayPoolActions) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.GatewayPool);
  };

  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.gatewayPool) {
      throw new BadRequestError({
        message: "Your current plan does not support gateway pools. Please upgrade to an Enterprise plan."
      });
    }
  };

  const createGatewayPool = async ({ name, ...actor }: TCreateGatewayPoolDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.CreateGatewayPools);
    await $checkLicense(actor.orgId);

    try {
      const pool = await gatewayPoolDAL.create({
        orgId: actor.orgId,
        name
      });
      return pool;
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        (error as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({
          message: `A gateway pool named "${name}" already exists in this organization.`
        });
      }
      throw error;
    }
  };

  const listGatewayPools = async (actor: TListGatewayPoolsDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.ListGatewayPools);
    await $checkLicense(actor.orgId);

    const pools = await gatewayPoolDAL.findByOrgIdWithDetails(actor.orgId);

    if (pools.length === 0) return [];

    // Add more DAL counts here as pool support expands to other consumers
    const [
      k8sAuthCounts,
      pkiDiscoveryCounts,
      pamDomainCounts,
      pamResourceCounts,
      pamDiscoverySourceCounts,
      appConnectionCounts,
      dynamicSecretCounts
    ] = await Promise.all([
      Promise.all(
        pools.map((pool) =>
          identityKubernetesAuthDAL.countByGatewayPoolId(pool.id).then((count) => ({ id: pool.id, count }))
        )
      ),
      Promise.all(
        pools.map((pool) =>
          pkiDiscoveryConfigDAL.countByGatewayPoolId(pool.id).then((count) => ({ id: pool.id, count }))
        )
      ),
      Promise.all(
        pools.map((pool) => pamDomainDAL.countByGatewayPoolId(pool.id).then((count) => ({ id: pool.id, count })))
      ),
      Promise.all(
        pools.map((pool) => pamResourceDAL.countByGatewayPoolId(pool.id).then((count) => ({ id: pool.id, count })))
      ),
      Promise.all(
        pools.map((pool) =>
          pamDiscoverySourceDAL.countByGatewayPoolId(pool.id).then((count) => ({ id: pool.id, count }))
        )
      ),
      Promise.all(
        pools.map((pool) => appConnectionDAL.countByGatewayPoolId(pool.id).then((count) => ({ id: pool.id, count })))
      ),
      Promise.all(
        pools.map((pool) => dynamicSecretDAL.countByGatewayPoolId(pool.id).then((count) => ({ id: pool.id, count })))
      )
    ]);

    const countMap = new Map<string, number>();
    for (const { id, count } of [
      ...k8sAuthCounts,
      ...pkiDiscoveryCounts,
      ...pamDomainCounts,
      ...pamResourceCounts,
      ...pamDiscoverySourceCounts,
      ...appConnectionCounts,
      ...dynamicSecretCounts
    ]) {
      countMap.set(id, (countMap.get(id) ?? 0) + count);
    }

    return pools.map((pool) => ({
      ...pool,
      connectedResourcesCount: countMap.get(pool.id) ?? 0
    }));
  };

  const getGatewayPoolById = async ({ poolId, ...actor }: TGetGatewayPoolByIdDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.ListGatewayPools);
    await $checkLicense(actor.orgId);

    const pool = await gatewayPoolDAL.findByIdWithMembers(poolId, actor.orgId);
    if (!pool) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    return pool;
  };

  const updateGatewayPool = async ({ poolId, name, ...actor }: TUpdateGatewayPoolDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.EditGatewayPools);
    await $checkLicense(actor.orgId);

    const existingPool = await gatewayPoolDAL.findById(poolId);
    if (!existingPool || existingPool.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    try {
      const updated = await gatewayPoolDAL.updateById(poolId, {
        ...(name !== undefined && { name })
      });
      return updated;
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        (error as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `A gateway pool named "${name}" already exists in this organization.` });
      }
      throw error;
    }
  };

  const deleteGatewayPool = async ({ poolId, ...actor }: TDeleteGatewayPoolDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.DeleteGatewayPools);
    await $checkLicense(actor.orgId);

    const existingPool = await gatewayPoolDAL.findById(poolId);
    if (!existingPool || existingPool.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    try {
      await gatewayPoolDAL.deleteById(poolId);
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        (error.error as { code?: string })?.code === DatabaseErrorCode.ForeignKeyViolation
      ) {
        throw new BadRequestError({
          message: `Cannot delete pool "${existingPool.name}" because it is referenced by one or more consumer configurations. Remove the pool reference from those configs first.`
        });
      }
      throw error;
    }

    return existingPool;
  };

  const addGatewayToPool = async ({ poolId, gatewayId, ...actor }: TAddGatewayToPoolDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.EditGatewayPools);
    await $checkLicense(actor.orgId);

    const pool = await gatewayPoolDAL.findById(poolId);
    if (!pool || pool.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    const gateway = await gatewayV2DAL.findById(gatewayId);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway with ID ${gatewayId} not found` });
    }

    try {
      const membership = await gatewayPoolMembershipDAL.create({ gatewayPoolId: poolId, gatewayId });
      return { membership, poolName: pool.name, gatewayName: gateway.name };
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        (error as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: "This gateway is already a member of the pool." });
      }
      throw error;
    }
  };

  const removeGatewayFromPool = async ({ poolId, gatewayId, ...actor }: TRemoveGatewayFromPoolDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.EditGatewayPools);
    await $checkLicense(actor.orgId);

    const pool = await gatewayPoolDAL.findById(poolId);
    if (!pool || pool.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    const gateway = await gatewayV2DAL.findById(gatewayId);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway with ID ${gatewayId} not found` });
    }

    const [deleted] = await gatewayPoolMembershipDAL.delete({ gatewayPoolId: poolId, gatewayId });
    if (!deleted) {
      throw new NotFoundError({ message: "Gateway is not a member of this pool." });
    }

    return { membership: deleted, poolName: pool.name, gatewayName: gateway.name };
  };

  const pickRandomHealthyGateway = async (poolId: string) => {
    const healthyGateways = await gatewayPoolMembershipDAL.findHealthyGatewaysByPoolId(poolId);
    if (healthyGateways.length === 0) {
      throw new BadRequestError({
        message: "Gateway pool has no healthy gateways."
      });
    }
    const selected = healthyGateways[Math.floor(Math.random() * healthyGateways.length)];
    logger.info(
      { poolId, selectedGatewayId: selected.id },
      `Pool gateway selection: picked gateway [gatewayId=${selected.id}] from pool [poolId=${poolId}]`
    );
    return selected;
  };

  const getPlatformConnectionDetailsByPoolId = async ({
    poolId,
    targetHost,
    targetPort
  }: TGetPlatformConnectionDetailsByPoolIdDTO): Promise<TGatewayV2ConnectionDetails | undefined> => {
    const pool = await gatewayPoolDAL.findById(poolId);
    if (!pool) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    const selectedGateway = await pickRandomHealthyGateway(poolId);

    return gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId: selectedGateway.id,
      targetHost,
      targetPort
    });
  };

  // Enforce license + RBAC + pool-belongs-to-org before a consumer attaches a pool. Does NOT require a healthy member.
  const resolveAttachableGatewayFromPool = async ({
    poolId,
    orgId,
    actor
  }: {
    poolId: string;
    orgId: string;
    actor: Pick<OrgServiceActor, "type" | "id" | "authMethod" | "orgId">;
  }) => {
    await $checkLicense(orgId);

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayPoolActions.AttachGatewayPools,
      OrgPermissionSubjects.GatewayPool
    );

    const pool = await gatewayPoolDAL.findById(poolId);
    if (!pool || pool.orgId !== orgId) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }
  };

  // Return gatewayId directly, or pick a random healthy pool member. Null when neither is set.
  const resolveEffectiveGatewayId = async ({
    gatewayId,
    gatewayPoolId
  }: {
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  }): Promise<string | null> => {
    if (gatewayId) return gatewayId;
    if (gatewayPoolId) {
      const picked = await pickRandomHealthyGateway(gatewayPoolId);
      return picked.id;
    }
    return null;
  };

  const getConnectedResources = async ({ poolId, ...actor }: TGetGatewayPoolByIdDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.ListGatewayPools);
    await $checkLicense(actor.orgId);

    const pool = await gatewayPoolDAL.findById(poolId);
    if (!pool || pool.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    // Add more DAL calls here as pool support expands to other consumers
    const [
      kubernetesAuths,
      pkiDiscoveryConfigs,
      pamDomains,
      pamResources,
      pamDiscoverySources,
      appConnections,
      dynamicSecrets
    ] = await Promise.all([
      identityKubernetesAuthDAL.findByGatewayPoolId(poolId),
      pkiDiscoveryConfigDAL.findByGatewayPoolId(poolId),
      pamDomainDAL.findByGatewayPoolId(poolId),
      pamResourceDAL.findByGatewayPoolId(poolId),
      pamDiscoverySourceDAL.findByGatewayPoolId(poolId),
      appConnectionDAL.findByGatewayPoolId(poolId),
      dynamicSecretDAL.findByGatewayPoolId(poolId)
    ]);

    return {
      kubernetesAuths,
      pkiDiscoveryConfigs,
      pamDomains,
      pamResources,
      pamDiscoverySources,
      appConnections,
      dynamicSecrets
    };
  };

  const getConnectedResourcesCount = async (poolId: string): Promise<number> => {
    // Add more DAL counts here as pool support expands to other consumers
    const [
      k8sAuthCount,
      pkiDiscoveryCount,
      pamDomainCount,
      pamResourceCount,
      pamDiscoverySourceCount,
      appConnectionCount,
      dynamicSecretCount
    ] = await Promise.all([
      identityKubernetesAuthDAL.countByGatewayPoolId(poolId),
      pkiDiscoveryConfigDAL.countByGatewayPoolId(poolId),
      pamDomainDAL.countByGatewayPoolId(poolId),
      pamResourceDAL.countByGatewayPoolId(poolId),
      pamDiscoverySourceDAL.countByGatewayPoolId(poolId),
      appConnectionDAL.countByGatewayPoolId(poolId),
      dynamicSecretDAL.countByGatewayPoolId(poolId)
    ]);
    return (
      k8sAuthCount +
      pkiDiscoveryCount +
      pamDomainCount +
      pamResourceCount +
      pamDiscoverySourceCount +
      appConnectionCount +
      dynamicSecretCount
    );
  };

  return {
    createGatewayPool,
    listGatewayPools,
    getGatewayPoolById,
    updateGatewayPool,
    deleteGatewayPool,
    addGatewayToPool,
    removeGatewayFromPool,
    pickRandomHealthyGateway,
    getPlatformConnectionDetailsByPoolId,
    getConnectedResources,
    getConnectedResourcesCount,
    resolveAttachableGatewayFromPool,
    resolveEffectiveGatewayId
  };
};
