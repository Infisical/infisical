import { Navigate, useParams } from "@tanstack/react-router";

import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";

import { useV4Session } from "../../data/session/contract";
import { v4Path } from "../../links";

export const OauthApplicationsPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/oauth-applications" });
  const { organization } = useV4Session();
  if (organization.isSubOrganization) {
    return <Navigate to={v4Path("/organizations/$orgId/settings")} params={{ orgId }} replace />;
  }
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="OAuth applications"
          description="Let external platforms access Infisical on behalf of your members."
        />
      </Stack>
    </TooltipProvider>
  );
};
