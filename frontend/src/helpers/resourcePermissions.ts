import { useCallback } from "react";
import { AbilityTuple, createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { conditionsMatcher } from "@app/hooks/api/roles/queries";

const RESOURCE_PERMISSION_STALE_TIME_MS = 60_000;
const RESOURCE_PERMISSION_REFETCH_INTERVAL_MS = 60_000;

export type ResourceMembership = {
  id: string;
  actorUserId?: string | null;
  actorIdentityId?: string | null;
  actorGroupId?: string | null;
  roles: Array<{ role: string; customRoleSlug?: string | null }>;
};

export type ResourcePermissionResponse<TPermissionSet extends AbilityTuple> = {
  permissions: PackRule<RawRuleOf<MongoAbility<TPermissionSet>>>[];
  memberships: ResourceMembership[];
};

type ResourcePermissionResult<TPermissionSet extends AbilityTuple> = {
  permission: MongoAbility<TPermissionSet>;
  memberships: ResourceMembership[];
};

type ResourcePermissionHookOptions<TPermissionSet extends AbilityTuple> = {
  queryKey: (resourceId: string) => readonly unknown[];
  fetchFn: (resourceId: string) => Promise<ResourcePermissionResponse<TPermissionSet>>;
};

export const createResourcePermissionQueryHook = <TPermissionSet extends AbilityTuple>(
  opts: ResourcePermissionHookOptions<TPermissionSet>
) => {
  const select = (
    data: ResourcePermissionResponse<TPermissionSet>
  ): ResourcePermissionResult<TPermissionSet> => {
    const rules = unpackRules<RawRuleOf<MongoAbility<TPermissionSet>>>(data.permissions);
    const permission = createMongoAbility<TPermissionSet>(rules, { conditionsMatcher });
    return { permission, memberships: data.memberships };
  };

  const useResourcePermissionQuery = (resourceId: string, enabled = true) =>
    useQuery({
      queryKey: resourceId
        ? opts.queryKey(resourceId)
        : (["resource-permissions", "disabled"] as const),
      queryFn: () => opts.fetchFn(resourceId),
      enabled: enabled && Boolean(resourceId),
      staleTime: RESOURCE_PERMISSION_STALE_TIME_MS,
      select
    });
  return useResourcePermissionQuery;
};

type ResourcePermissionSuspenseHookOptions<TPermissionSet extends AbilityTuple> =
  ResourcePermissionHookOptions<TPermissionSet> & {
    paramName: string;
    hookName: string;
  };

export const createResourcePermissionSuspenseHook = <TPermissionSet extends AbilityTuple>(
  opts: ResourcePermissionSuspenseHookOptions<TPermissionSet>
) => {
  const select = (
    data: ResourcePermissionResponse<TPermissionSet>
  ): ResourcePermissionResult<TPermissionSet> => {
    const rules = unpackRules<RawRuleOf<MongoAbility<TPermissionSet>>>(data.permissions);
    const permission = createMongoAbility<TPermissionSet>(rules, { conditionsMatcher });
    return { permission, memberships: data.memberships };
  };

  const useResourcePermissionSuspense = () => {
    const resourceId = useParams({
      strict: false,
      select: (el) => (el as Record<string, string | undefined> | undefined)?.[opts.paramName]
    });
    if (!resourceId) {
      throw new Error(
        `${opts.hookName} must be used within a route that declares ${opts.paramName}`
      );
    }
    const {
      data: { permission, memberships }
    } = useSuspenseQuery({
      queryKey: opts.queryKey(resourceId),
      queryFn: () => opts.fetchFn(resourceId),
      staleTime: RESOURCE_PERMISSION_STALE_TIME_MS,
      refetchInterval: RESOURCE_PERMISSION_REFETCH_INTERVAL_MS,
      refetchOnWindowFocus: true,
      select
    });
    const hasRole = useCallback(
      (role: string) => memberships?.some((m) => m.roles.some((r) => r.role === role)) ?? false,
      [memberships]
    );
    return { permission, memberships, hasRole };
  };
  return useResourcePermissionSuspense;
};
