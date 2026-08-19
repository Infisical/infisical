import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import Telemetry from "@app/components/utilities/telemetry/Telemetry";
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

// Measures how many users still try to create a native integration after creation was closed, so we
// can size the remaining demand ahead of the deprecation date.
const CREATION_BLOCKED_MODAL_VIEWED_EVENT = "Native Integration Creation Blocked Modal Viewed";

// Shown instead of the provider picker: native integrations are closed to new creation, so this is
// the only thing the "Add Integration" button does now.
export const NativeIntegrationsCreationBlockedModal = ({ isOpen, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const scopeVariant = useScopeVariant();

  // Fires on each open. Unlike a one-time nudge, this modal can be reopened many times per session,
  // and each attempt is a signal worth counting.
  useEffect(() => {
    if (isOpen) {
      const telemetry = new Telemetry().getInstance();
      telemetry.capture(CREATION_BLOCKED_MODAL_VIEWED_EVENT, {
        orgId: currentOrg.id,
        projectId: currentProject.id,
        projectType: currentProject.type
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
          <DialogDescription className="my-4 whitespace-pre-line text-foreground/75">
            Native Integrations are being retired on {NATIVE_INTEGRATION_DEPRECATION_DATE}, and new
            ones can no longer be created. Secret Syncs are the recommended way to sync secrets to
            third-party services. Your existing integrations will keep syncing until the retirement
            date.{" "}
            <a
              href="https://infisical.com/docs/integrations/secret-syncs/native-integrations-migration"
              target="_blank"
              rel="noreferrer"
              className="underline hover:opacity-80"
            >
              Read more about the migration to Secret Syncs
            </a>
            .
          </DialogDescription>
        </DialogHeader>
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
