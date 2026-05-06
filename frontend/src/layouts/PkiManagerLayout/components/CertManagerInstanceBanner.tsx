import { useParams } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { Alert, Button } from "@app/components/v3";
import { useOrgPermission } from "@app/context";
import {
  OrgPermissionCertManagerActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { usePopUp } from "@app/hooks/usePopUp";

import { ActiveInstanceModal } from "./ActiveInstanceModal";

export const CertManagerInstanceBanner = () => {
  const { projectId } = useParams({ strict: false });
  const { data, isPending } = useCertManagerInstanceState();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["activeInstance"] as const);
  const { permission } = useOrgPermission();
  const canManage = permission.can(
    OrgPermissionCertManagerActions.ManageInstance,
    OrgPermissionSubjects.CertManager
  );

  if (isPending || !data || !data.isMultiInstance) return null;

  const activeProject = data.projects.find((p) => p.id === data.activeProjectId);
  const otherCount = Math.max(0, data.projects.length - 1);
  const isViewingActive = activeProject?.id === projectId;

  const variant = isViewingActive ? "info" : "warning";
  const message = isViewingActive
    ? `Your organization has ${otherCount} other Cert Manager ${otherCount === 1 ? "workspace" : "workspaces"}, consolidate to a single workspace, multi-project Cert Manager will be deprecated soon.`
    : `Legacy Cert Manager instance (active is ${activeProject?.name ?? "not set"}) — consolidate to a single instance, multi-project Cert Manager will be deprecated soon.`;

  return (
    <>
      <div className="px-12 py-3">
        <Alert variant={variant} className="flex items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Info className="size-4 shrink-0" />
            <span>{message}</span>
          </div>
          {canManage && (
            <Button size="xs" variant="outline" onClick={() => handlePopUpOpen("activeInstance")}>
              Manage instances
            </Button>
          )}
        </Alert>
      </div>

      <ActiveInstanceModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </>
  );
};
