import type { ReactNode } from "react";
import type { MongoAbility } from "@casl/ability";
import { useParams } from "@tanstack/react-router";

import { Loader } from "@app/components/v4/ui/loader";
import type { ProjectPermissionSet } from "@app/context/ProjectPermissionContext/types";

import { useProjectPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";
import { useCertManagerProjectId } from "../components/certificate";

export const RESTRICTED = "Your role doesn't allow this";

export const useCertManagerSettingsScope = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/cert-manager/settings" });
  const { projectId } = useCertManagerProjectId(orgId);
  return { orgId, projectId: projectId ?? "" };
};

export const useSettingsPermission = () => {
  const { projectId } = useCertManagerSettingsScope();
  return useProjectPermission(projectId);
};

export const PermissionGuard = ({
  allowed,
  requirement,
  children
}: {
  allowed: (permission: MongoAbility<ProjectPermissionSet>) => boolean;
  requirement: string;
  children: ReactNode;
}) => {
  const { permission, isPending } = useSettingsPermission();
  if (isPending) return <Loader label="Checking access" />;
  if (!allowed(permission)) return <AccessRestricted requirement={requirement} />;
  return children;
};
