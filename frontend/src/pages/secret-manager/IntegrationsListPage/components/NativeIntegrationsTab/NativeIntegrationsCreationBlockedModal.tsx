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
import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/const/nativeIntegrationDeprecation";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useScopeVariant } from "@app/hooks";
import { IntegrationsListPageTabs } from "@app/types/integrations";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

// Shown instead of the provider picker: native integrations are closed to new creation, so this is
// the only thing the "Add Integration" button does now.
export const NativeIntegrationsCreationBlockedModal = ({ isOpen, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const scopeVariant = useScopeVariant();

  const handleGoToSecretSyncs = () => {
    navigate({
      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
      params: { orgId: currentOrg.id, projectId: currentProject.id },
      search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Use Secret Syncs Instead</DialogTitle>
          <DialogDescription>
            Native Integrations are being retired on {NATIVE_INTEGRATION_DEPRECATION_DATE}, and new
            ones can no longer be created. Secret Syncs are the recommended way to sync secrets to
            third-party services. They support the same services and add capabilities Native
            Integrations do not have.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-accent">Your existing integrations keep working until then.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={scopeVariant} onClick={handleGoToSecretSyncs}>
            Go to Secret Syncs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
