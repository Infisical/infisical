import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { useOrganization, useOrgPermission } from "@app/context";
import {
  OrgPermissionCertManagerActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

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

  const handleGoToSettings = () => {
    navigate({
      to: "/organizations/$orgId/settings",
      params: { orgId: currentOrg.id },
      search: { selectedTab: "product-settings" }
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="gap-6">
          <DialogTitle>Select an active Certificate Manager project</DialogTitle>
          <DialogDescription>
            Certificate Manager now supports one instance per organization. An organization admin
            needs to select the active project in the Product Settings before you can continue.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canManageInstance && (
            <Button variant="project" onClick={handleGoToSettings}>
              Go to Settings
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
