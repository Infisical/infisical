import { useNavigate } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/const/nativeIntegrationDeprecation";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { IntegrationsListPageTabs } from "@app/types/integrations";

// Not dismissible: it is contextual to the deprecated tab rather than an interruption, so it stays
// visible while the user works through their integrations.
export const NativeIntegrationsDeprecationAlert = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const handleMigrate = () => {
    navigate({
      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
      params: { orgId: currentOrg.id, projectId: currentProject.id },
      search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
    });
  };

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>
        Native integrations stop working on {NATIVE_INTEGRATION_DEPRECATION_DATE}.
      </AlertTitle>
      <AlertDescription>
        <p>
          Recreate these as Secret Syncs before then to keep your secrets syncing. Secret Syncs
          support all the same third-party services.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="warning" size="xs" onClick={handleMigrate}>
            Migrate to Secret Syncs
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};
