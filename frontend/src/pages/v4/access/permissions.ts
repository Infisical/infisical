import { useContext } from "react";
import { createMongoAbility } from "@casl/ability";
import { useParams } from "@tanstack/react-router";

import type { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";
import type { ProjectPermissionSet } from "@app/context/ProjectPermissionContext/types";

import { useV4Adapter } from "../data/adapters";
import { V4SessionContext } from "../data/session/contract";

const noOrgAccess = createMongoAbility<OrgPermissionSet>([]);
const noProjectAccess = createMongoAbility<ProjectPermissionSet>([]);

// The server console has no org route, so it falls back to the session's organization.
export const useOrgId = () => {
  const { orgId } = useParams({ strict: false });
  const session = useContext(V4SessionContext);
  return orgId ?? session!.organization.id;
};

export const useOrgPermission = () => {
  const orgId = useOrgId();
  const { data, isPending } = useV4Adapter("access").useOrgPermission({ orgId });
  return { permission: data?.permission ?? noOrgAccess, isPending };
};

export const useProjectPermission = (projectId: string) => {
  const { data, isPending } = useV4Adapter("access").useProjectPermission({ projectId });
  return { permission: data?.permission ?? noProjectAccess, isPending };
};
