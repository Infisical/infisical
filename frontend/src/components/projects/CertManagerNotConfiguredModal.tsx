import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization, useOrgPermission } from "@app/context";
import {
  OrgPermissionCertManagerActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { setCertManagerActiveProjectCookie } from "@app/helpers/certManagerActiveProject";
import {
  useCertManagerInstanceState,
  useSetCertManagerActiveProject
} from "@app/hooks/api/certManagerInstance";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CertManagerNotConfiguredModal = ({ isOpen, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const canManageInstance = permission.can(
    OrgPermissionCertManagerActions.ManageInstance,
    OrgPermissionSubjects.CertManager
  );
  const { data: instanceState } = useCertManagerInstanceState();
  const setActive = useSetCertManagerActiveProject();
  const [selectedId, setSelectedId] = useState<string>("");

  const projects = instanceState?.projects ?? [];
  const canSelect = canManageInstance && projects.length > 0;

  const handleSetActive = async () => {
    if (!selectedId) return;
    try {
      await setActive.mutateAsync(selectedId);
    } catch {
      return;
    }
    setCertManagerActiveProjectCookie(currentOrg.id, selectedId);
    onOpenChange(false);
    navigate({
      to: "/organizations/$orgId/cert-manager/overview",
      params: { orgId: currentOrg.id }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" isPending={setActive.isPending}>
        <DialogHeader className="gap-6">
          <DialogTitle>Select an active Certificate Manager project</DialogTitle>
          <DialogDescription>
            {canSelect
              ? "Certificate Manager now supports one project per organization. Choose the project everyone in your organization will use."
              : "Certificate Manager now supports one project per organization. An organization admin needs to select the active project before you can continue."}
          </DialogDescription>
        </DialogHeader>
        {canSelect && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Certificate Manager project</span>
            <Select value={selectedId || undefined} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-72 w-(--radix-select-trigger-width)"
              >
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="truncate">{project.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          {canSelect && (
            <Button
              variant="project"
              isDisabled={!selectedId}
              isPending={setActive.isPending}
              onClick={handleSetActive}
            >
              Set as active
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
