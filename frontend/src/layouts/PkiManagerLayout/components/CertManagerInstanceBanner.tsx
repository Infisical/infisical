import { useParams } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { Button } from "@app/components/v3";
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

  return (
    <>
      <div className="flex items-start gap-3 border-b border-mineshaft-600 bg-mineshaft-800 px-12 py-3 text-sm text-mineshaft-200">
        <InfoIcon size={16} className="mt-0.5 text-warning" />
        <div className="flex-1">
          {isViewingActive ? (
            <>
              You&apos;re viewing the active instance
              {activeProject ? (
                <span className="text-mineshaft-100"> — {activeProject.name}</span>
              ) : null}
              . Your org has <span className="text-mineshaft-100">{otherCount} other</span> Cert
              Manager
              {otherCount === 1 ? " instance" : " instances"} from the legacy multi-project model.
            </>
          ) : (
            <>
              This is a legacy Cert Manager instance. The active instance is{" "}
              <span className="text-mineshaft-100">{activeProject?.name ?? "not set"}</span>; new
              API requests without a <code>projectId</code> resolve there.
            </>
          )}
          <span className="ml-1">We&apos;re moving Cert Manager to a single-instance model.</span>
        </div>
        {canManage && (
          <Button size="xs" variant="outline" onClick={() => handlePopUpOpen("activeInstance")}>
            Manage instances
          </Button>
        )}
      </div>

      <ActiveInstanceModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </>
  );
};
