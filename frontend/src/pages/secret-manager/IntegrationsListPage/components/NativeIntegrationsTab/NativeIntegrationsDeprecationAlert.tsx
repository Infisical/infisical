import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/const/nativeIntegrationDeprecation";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { IntegrationsListPageTabs } from "@app/types/integrations";

// Not dismissible: it is contextual to the deprecated tab rather than an interruption, so it stays
// visible while the user works through their integrations.
export const NativeIntegrationsDeprecationAlert = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  return (
    <Alert variant="warning" className="mb-4">
      <TriangleAlertIcon />
      {/* AlertTitle is line-clamp-1 by default, which would truncate the date on a narrow viewport */}
      <AlertTitle className="line-clamp-none">
        Native integrations stop working on {NATIVE_INTEGRATION_DEPRECATION_DATE}.
      </AlertTitle>
      <AlertDescription>
        <p>
          Recreate these as Secret Syncs before then to keep your secrets syncing. Secret Syncs
          support all the same third-party services.
        </p>
        <Button variant="warning" size="xs" className="mt-2" asChild>
          <Link
            to={ROUTE_PATHS.SecretManager.IntegrationsListPage.path}
            params={{ orgId: currentOrg.id, projectId: currentProject.id }}
            search={{ selectedTab: IntegrationsListPageTabs.SecretSyncs }}
          >
            Migrate to Secret Syncs
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
};
