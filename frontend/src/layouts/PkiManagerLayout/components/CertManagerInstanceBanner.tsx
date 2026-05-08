import { useState } from "react";
import { faCheck, faChevronDown, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v3";
import { useOrgPermission } from "@app/context";
import {
  OrgPermissionCertManagerActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  useCertManagerInstanceState,
  useCertManagerLegacyInstances,
  useSetCertManagerActiveProject
} from "@app/hooks/api/certManagerInstance";

export const CertManagerInstanceBanner = () => {
  const params = useParams({ strict: false }) as { projectId?: string; orgId?: string };
  const { projectId, orgId } = params;
  const navigate = useNavigate();
  const { data, isPending } = useCertManagerInstanceState();
  const { data: legacyData } = useCertManagerLegacyInstances();
  const setActive = useSetCertManagerActiveProject();
  const [pendingId, setPendingId] = useState<string | null>(null);
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
    ? `Your organization has ${otherCount} other Certificate Manager ${otherCount === 1 ? "project" : "projects"}, consolidate to a single project, multi-project Certificate Manager will be deprecated soon.`
    : `Legacy Certificate Manager instance (active is ${activeProject?.name ?? "not set"}) — consolidate to a single instance, multi-project Certificate Manager will be deprecated soon.`;

  const handlePick = async (instanceId: string, name: string) => {
    if (instanceId === activeProject?.id) return;
    setPendingId(instanceId);
    try {
      await setActive.mutateAsync(instanceId);
      createNotification({
        type: "success",
        text: `${name} is now the active Certificate Manager instance`
      });
      if (orgId) {
        navigate({
          to: `/organizations/${orgId}/projects/cert-manager/${instanceId}/overview` as never
        } as never);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to switch active instance.";
      createNotification({ type: "error", text: detail });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="flex w-full items-center border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
      <FontAwesomeIcon icon={faWarning} className="mr-2.5 text-base text-yellow" />
      <span>{message}</span>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="outline_bg"
              className="ml-auto"
              isLoading={Boolean(pendingId)}
              rightIcon={<FontAwesomeIcon icon={faChevronDown} className="ml-1.5" />}
            >
              Manage instances
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[420px]">
            <DropdownMenuLabel>Switch active instance</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {!legacyData || legacyData.instances.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted">No instances available.</div>
            ) : (
              legacyData.instances.map((i) => (
                <DropdownMenuItem
                  key={i.id}
                  onClick={() => handlePick(i.id, i.name)}
                  isDisabled={Boolean(pendingId)}
                >
                  <div className="flex w-full items-center gap-2">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-baseline gap-x-2">
                        <span className="truncate font-medium">{i.name}</span>
                        <span className="font-mono text-xs text-accent">{i.slug}</span>
                      </div>
                      <span className="text-xs text-muted">
                        {i.certificateCount} cert{i.certificateCount === 1 ? "" : "s"} ·{" "}
                        {i.syncCount} sync{i.syncCount === 1 ? "" : "s"} · {i.alertCount} alert
                        {i.alertCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {i.isActive && (
                      <FontAwesomeIcon icon={faCheck} className="text-xs text-success" />
                    )}
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
