import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

// Temporary limit until pool limiting is implemented at the plan level
const MAX_GATEWAY_POOLS_PER_ORG = 50;
import { TIdentityKubernetesAuthDALFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-dal";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TGatewayV2ConnectionDetails } from "../gateway-v2/gateway-v2-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionGatewayPoolActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
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
};

export type TGatewayPoolServiceFactory = ReturnType<typeof gatewayPoolServiceFactory>;

export const gatewayPoolServiceFactory = ({
  gatewayPoolDAL,
  gatewayPoolMembershipDAL,
  gatewayV2DAL,
  gatewayV2Service,
  permissionService,
  licenseService,
  identityKubernetesAuthDAL
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

    const pool = await gatewayPoolDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateGatewayPool(actor.orgId)]);

      const existingCount = await gatewayPoolDAL.countByOrgId(actor.orgId, tx);
      if (existingCount >= MAX_GATEWAY_POOLS_PER_ORG) {
        throw new BadRequestError({
          message: `Organization has reached the maximum limit of ${MAX_GATEWAY_POOLS_PER_ORG} gateway pools`
        });
      }

      try {
        return await gatewayPoolDAL.create({ orgId: actor.orgId, name }, tx);
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
    });

    return pool;
  };

  const listGatewayPools = async (actor: TListGatewayPoolsDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.ListGatewayPools);
    await $checkLicense(actor.orgId);

    const pools = await gatewayPoolDAL.findByOrgIdWithDetails(actor.orgId);

    const poolsWithCounts = await Promise.all(
      pools.map(async (pool) => {
        // Add more DAL counts here as pool support expands to other consumers
        const k8sCount = await identityKubernetesAuthDAL.countByGatewayPoolId(pool.id);
        return { ...pool, connectedResourcesCount: k8sCount };
      })
    );

    return poolsWithCounts;
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

    await gatewayPoolDAL.transaction(async (tx) => {
      // Check for referencing consumer configs inside transaction to prevent race conditions
      // Add more DAL counts here as pool support expands
      const k8sAuthCount = await identityKubernetesAuthDAL.countByGatewayPoolId(poolId, tx);
      const totalReferences = k8sAuthCount;
      if (totalReferences > 0) {
        throw new BadRequestError({
          message: `Cannot delete pool "${existingPool.name}" because it is referenced by ${totalReferences} consumer configuration(s). Remove the pool reference from those configs first.`
        });
      }

      await gatewayPoolDAL.deleteById(poolId, tx);
    });

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
      return membership;
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

    const [deleted] = await gatewayPoolMembershipDAL.delete({ gatewayPoolId: poolId, gatewayId });
    if (!deleted) {
      throw new NotFoundError({ message: "Gateway is not a member of this pool." });
    }

    return deleted;
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

  const getConnectedResources = async ({ poolId, ...actor }: TGetGatewayPoolByIdDTO) => {
    await $checkPermission(actor, OrgPermissionGatewayPoolActions.ListGatewayPools);
    await $checkLicense(actor.orgId);

    const pool = await gatewayPoolDAL.findById(poolId);
    if (!pool || pool.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    // Add more DAL calls here as pool support expands to other consumers
    const kubernetesAuths = await identityKubernetesAuthDAL.findByGatewayPoolId(poolId);

    return { kubernetesAuths };
  };

  const getConnectedResourcesCount = async (poolId: string): Promise<number> => {
    // Add more DAL counts here as pool support expands to other consumers
    const k8sAuthCount = await identityKubernetesAuthDAL.countByGatewayPoolId(poolId);
    return k8sAuthCount;
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
    getConnectedResourcesCount
  };
};
