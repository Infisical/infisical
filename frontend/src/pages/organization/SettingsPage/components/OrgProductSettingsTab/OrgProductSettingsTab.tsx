import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { useOrganization } from "@app/context";

import { OrgCertManagerTab } from "../OrgCertManagerTab";

export const OrgProductSettingsTab = () => {
  const { currentOrg } = useOrganization();

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        <InfoIcon />
        <AlertTitle>Secrets Management Settings Have Moved</AlertTitle>
        <AlertDescription className="inline">
          Secrets management configurations now live under{" "}
          <Link
            to="/organizations/$orgId/projects/secret-management/product-settings"
            params={{ orgId: currentOrg.id }}
            className="inline underline hover:opacity-80"
          >
            Secret Management Product Settings
          </Link>
          .
        </AlertDescription>
      </Alert>
      <OrgCertManagerTab />
    </div>
  );
};
