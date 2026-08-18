import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, GatewayTransportError, NotFoundError } from "@app/lib/errors";
import { runGatewayAttempt } from "@app/lib/gateway-v2/gateway-attempt-context";
import { getGatewayLoadTracker } from "@app/lib/gateway-v2/gateway-load-tracker";
import { isAttemptRetryable } from "@app/lib/gateway-v2/gateway-retry";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TIdentityKubernetesAuthDALFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-dal";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionGatewayPoolActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TPkiDiscoveryConfigDALFactory } from "../pki-discovery/pki-discovery-config-dal";
import { TGatewayPoolDALFactory } from "./gateway-pool-dal";
import { TGatewayPoolMembershipDALFactory } from "./gateway-pool-membership-dal";
import { chooseLeastLoadedGateway, pickRandomGateway } from "./gateway-pool-selection-fns";
import {
  DEFAULT_POOL_FAILOVER_ATTEMPTS,
  TAddGatewayToPoolDTO,
  TCreateGatewayPoolDTO,
  TDeleteGatewayPoolDTO,
  TGetGatewayPoolByIdDTO,
  TListGatewayPoolsDTO,
  TRemoveGatewayFromPoolDTO,
  TRunWithPoolFailoverDTO,
  TSelectGatewayFromPoolDTO,
  TUpdateGatewayPoolDTO
} from "./gateway-pool-types";

type TGatewayPoolServiceFactoryDep = {
  gatewayPoolDAL: TGatewayPoolDALFactory;
  gatewayPoolMembershipDAL: TGatewayPoolMembershipDALFactory;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  identityKubernetesAuthDAL: Pick<TIdentityKubernetesAuthDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  pkiDiscoveryConfigDAL: Pick<TPkiDiscoveryConfigDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findByGatewayPoolId" | "countByGatewayPoolId">;
};

export type TGatewayPoolServiceFactory = ReturnType<typeof gatewayPoolServiceFactory>;

export const gatewayPoolServiceFactory = ({
  gatewayPoolDAL,
  gatewayPoolMembershipDAL,
  gatewayV2DAL,
  permissionService,
  licenseService,
  identityKubernetesAuthDAL,
  pkiDiscoveryConfigDAL,
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
    const [k8sAuthCounts, pkiDiscoveryCounts, appConnectionCounts, dynamicSecretCounts] = await Promise.all([
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

  const selectGatewayFromPool = async ({ poolId, exclude, filter, unavailableMessage }: TSelectGatewayFromPoolDTO) => {
    const targetPool = await gatewayPoolDAL.findById(poolId);
    if (!targetPool) {
      throw new NotFoundError({ message: `Gateway pool with ID ${poolId} not found` });
    }

    const healthyGateways = await gatewayPoolMembershipDAL.findHealthyGatewaysByPoolId(poolId);

    const eligible = healthyGateways
      .filter((gateway) => !exclude?.has(gateway.id))
      .filter((gateway) => (filter ? filter(gateway) : true));

    if (eligible.length === 0) {
      throw new BadRequestError({
        message: unavailableMessage ?? "Gateway pool has no healthy gateways."
      });
    }

    const loadTracker = getGatewayLoadTracker();
    let selected: (typeof eligible)[number] | undefined;

    if (loadTracker) {
      try {
        const ids = eligible.map((gateway) => gateway.id);
        const suspect = await loadTracker.getSuspect(ids);
        // A pool where every member recently failed is still worth attempting: refusing to route is a
        // guaranteed outage, whereas the suspect marks may simply have aged badly.
        const candidates = eligible.filter((gateway) => !suspect.has(gateway.id));
        const pool = candidates.length > 0 ? candidates : eligible;

        const scores = await loadTracker.getScores(pool.map((gateway) => gateway.id));
        selected = chooseLeastLoadedGateway(pool, scores);
      } catch (err) {
        logger.warn({ err, poolId }, `Gateway load lookup failed, falling back to random selection [poolId=${poolId}]`);
      }
    }

    if (!selected) selected = pickRandomGateway(eligible);
    if (!selected)
      throw new BadRequestError({ message: unavailableMessage ?? "Gateway pool has no healthy gateways." });

    // Bookkeeping must never be able to fail a selection, whatever the tracker does internally.
    try {
      await loadTracker?.reserve(selected.id);
    } catch (err) {
      logger.warn({ err, poolId }, `Failed to reserve gateway capacity [poolId=${poolId}]`);
    }

    logger.info(
      { poolId, selectedGatewayId: selected.id },
      `Pool gateway selection: picked gateway [gatewayId=${selected.id}] from pool [poolId=${poolId}]`
    );
    return selected;
  };

  const pickHealthyGateway = async (poolId: string) => selectGatewayFromPool({ poolId });

  /**
   * Runs an operation against a pool, retrying on another member when the tunnel could not be
   * established. Only GatewayTransportError retries, because it is the one failure that guarantees
   * nothing reached the target.
   */
  const runWithPoolFailover = async <T>(
    {
      poolId,
      gatewayId,
      filter,
      maxAttempts = DEFAULT_POOL_FAILOVER_ATTEMPTS,
      unavailableMessage
    }: TRunWithPoolFailoverDTO,
    operation: (gatewayId: string) => Promise<T>
  ): Promise<{ result: T; gatewayId: string }> => {
    if (gatewayId || !poolId) {
      if (!gatewayId) {
        throw new BadRequestError({ message: unavailableMessage ?? "No gateway or gateway pool is configured." });
      }
      return { result: await operation(gatewayId), gatewayId };
    }

    const tried = new Set<string>();
    let lastError: unknown;

    // Sequential by design: each attempt has to know which member just failed.
    /* eslint-disable no-await-in-loop */
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let selected: Awaited<ReturnType<typeof selectGatewayFromPool>>;
      try {
        selected = await selectGatewayFromPool({ poolId, exclude: tried, filter, unavailableMessage });
      } catch (err) {
        // Running out of untried members is only interesting on the first attempt. After that the
        // transport failure that got us here is the useful error, not "pool has no healthy gateways".
        if (!lastError) throw err;
        break;
      }
      tried.add(selected.id);

      const gatewayAttempt = { transportFailed: false, tunnelEstablished: false };
      try {
        return {
          result: await runGatewayAttempt(gatewayAttempt, () => operation(selected.id)),
          gatewayId: selected.id
        };
      } catch (err) {
        // Providers rewrap gateway errors in their own BadRequestError, so the async-local flag is
        // the only reliable signal that nothing reached the target.
        const retryable = isAttemptRetryable({
          transportFailed: gatewayAttempt.transportFailed,
          tunnelEstablished: gatewayAttempt.tunnelEstablished,
          isTransportError: err instanceof GatewayTransportError
        });
        if (!retryable) throw err;
        lastError = err;
        logger.warn(
          { err, poolId, gatewayId: selected.id, attempt },
          `Gateway unreachable, retrying on another pool member [poolId=${poolId}] [gatewayId=${selected.id}]`
        );
      }
    }
    /* eslint-enable no-await-in-loop */

    throw lastError instanceof Error
      ? lastError
      : new BadRequestError({ message: "Failed to reach any gateway in the pool." });
  };

  const listHealthyGateways = async (poolId: string) => {
    return gatewayPoolMembershipDAL.findHealthyGatewaysByPoolId(poolId);
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
      const picked = await pickHealthyGateway(gatewayPoolId);
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
    const [kubernetesAuths, pkiDiscoveryConfigs, appConnections, dynamicSecrets] = await Promise.all([
      identityKubernetesAuthDAL.findByGatewayPoolId(poolId),
      pkiDiscoveryConfigDAL.findByGatewayPoolId(poolId),
      appConnectionDAL.findByGatewayPoolId(poolId),
      dynamicSecretDAL.findByGatewayPoolId(poolId)
    ]);

    return {
      kubernetesAuths,
      pkiDiscoveryConfigs,
      appConnections,
      dynamicSecrets
    };
  };

  const getConnectedResourcesCount = async (poolId: string): Promise<number> => {
    // Add more DAL counts here as pool support expands to other consumers
    const [k8sAuthCount, pkiDiscoveryCount, appConnectionCount, dynamicSecretCount] = await Promise.all([
      identityKubernetesAuthDAL.countByGatewayPoolId(poolId),
      pkiDiscoveryConfigDAL.countByGatewayPoolId(poolId),
      appConnectionDAL.countByGatewayPoolId(poolId),
      dynamicSecretDAL.countByGatewayPoolId(poolId)
    ]);
    return k8sAuthCount + pkiDiscoveryCount + appConnectionCount + dynamicSecretCount;
  };

  return {
    createGatewayPool,
    listGatewayPools,
    getGatewayPoolById,
    updateGatewayPool,
    deleteGatewayPool,
    addGatewayToPool,
    removeGatewayFromPool,
    pickHealthyGateway,
    selectGatewayFromPool,
    runWithPoolFailover,
    listHealthyGateways,

    getConnectedResources,
    getConnectedResourcesCount,
    resolveAttachableGatewayFromPool,
    resolveEffectiveGatewayId
  };
};
