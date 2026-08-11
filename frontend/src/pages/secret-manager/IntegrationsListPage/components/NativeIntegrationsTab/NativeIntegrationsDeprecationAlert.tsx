import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
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
      <AlertTitle>Migrate to Secret Syncs</AlertTitle>
      <AlertDescription className="inline">
        Native Integrations are being retired on {NATIVE_INTEGRATION_DEPRECATION_DATE}.{" "}
        <Link
          to={ROUTE_PATHS.SecretManager.IntegrationsListPage.path}
          params={{ orgId: currentOrg.id, projectId: currentProject.id }}
          search={{ selectedTab: IntegrationsListPageTabs.SecretSyncs }}
          className="inline underline hover:opacity-80"
        >
          Secret Syncs
        </Link>{" "}
        are the new, recommended way to sync Infisical secrets to third-party services, offering
        more features and supporting all the same services. Your existing integrations will keep
        syncing until the retirement date.
        <a
          href="https://infisical.com/docs/integrations/secret-syncs/native-integrations-migration"
          target="_blank"
          rel="noreferrer"
          className="underline hover:opacity-80"
        >
          Read more about the migration to Secret Syncs
        </a>
        .
      </AlertDescription>
    </Alert>
  );
};
