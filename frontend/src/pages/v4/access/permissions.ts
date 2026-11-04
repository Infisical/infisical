import { createMongoAbility } from "@casl/ability";
import { useParams } from "@tanstack/react-router";

import type { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";
import type { ProjectPermissionSet } from "@app/context/ProjectPermissionContext/types";

import { useV4Adapter } from "../data/adapters";

const noOrgAccess = createMongoAbility<OrgPermissionSet>([]);
const noProjectAccess = createMongoAbility<ProjectPermissionSet>([]);

export const useOrgId = () => useParams({ from: "/v4/organizations/$orgId" }).orgId;

export const useOrgPermission = () => {
  const orgId = useOrgId();
  const { data, isPending } = useV4Adapter("access").useOrgPermission({ orgId });
  return { permission: data?.permission ?? noOrgAccess, isPending };
};

export const useProjectPermission = (projectId: string) => {
  const { data, isPending } = useV4Adapter("access").useProjectPermission({ projectId });
  return { permission: data?.permission ?? noProjectAccess, isPending };
};
