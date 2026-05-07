import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useParams } from "@tanstack/react-router";

import { Button } from "@app/components/v2";
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

  const message = isViewingActive
    ? `Your organization has ${otherCount} other Cert Manager ${otherCount === 1 ? "workspace" : "workspaces"}, consolidate to a single workspace, multi-project Cert Manager will be deprecated soon.`
    : `Legacy Cert Manager instance (active is ${activeProject?.name ?? "not set"}) — consolidate to a single instance, multi-project Cert Manager will be deprecated soon.`;

  return (
    <>
      <div className="flex w-full items-center border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
        <FontAwesomeIcon icon={faWarning} className="mr-2.5 text-base text-yellow" />
        <span>{message}</span>
        {canManage && (
          <Button
            size="xs"
            variant="outline_bg"
            className="ml-auto"
            onClick={() => handlePopUpOpen("activeInstance")}
          >
            Manage instances
          </Button>
        )}
      </div>

      <ActiveInstanceModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </>
  );
};
