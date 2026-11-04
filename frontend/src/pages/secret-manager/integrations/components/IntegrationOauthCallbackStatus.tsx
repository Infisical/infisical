import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, PlugZapIcon, UnplugIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { Button } from "@app/components/v3";
import { PageLoader } from "@app/components/v3/platform/PageLoader";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { ErrorPageFrame, useErrorPageTimestamp } from "@app/pages/public/ErrorPage/components";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const INVALID_OAUTH_STATE_MESSAGE =
  "This authorization link is no longer valid. It may have expired, or it was started in another browser or tab.";

const ConnectionFailed = ({
  integrationName,
  error
}: {
  integrationName: string;
  error: string;
}) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const occurredAt = useErrorPageTimestamp();

  return (
    <ErrorPageFrame
      pageTitle={`${integrationName} Connection Failed`}
      badgeIcon={<UnplugIcon />}
      badgeText="Connection Failed"
      heading={`We couldn't connect ${integrationName}.`}
      description={`${error} Start the connection again from the Integrations page.`}
      actions={
        <Button variant="project" asChild>
          <Link
            to={ROUTE_PATHS.SecretManager.IntegrationsListPage.path}
            params={{ orgId: currentOrg.id, projectId: currentProject.id }}
            search={{ selectedTab: IntegrationsListPageTabs.NativeIntegrations }}
          >
            <ArrowLeftIcon />
            Back to Integrations
          </Link>
        </Button>
      }
      statusRows={[
        {
          icon: <PlugZapIcon />,
          label: integrationName,
          state: "Not connected",
          tone: "warning"
        }
      ]}
      monoRows={[
        ["route", window.location.pathname],
        ["time", occurredAt]
      ]}
      report={[
        `route: ${window.location.pathname}`,
        `integration: ${integrationName}`,
        `error: ${error}`,
        `time: ${occurredAt}`
      ].join("\n")}
    />
  );
};

type Props = {
  integrationName: string;
  error: string | null;
};

export const IntegrationOauthCallbackStatus = ({ integrationName, error }: Props) => {
  if (error) return <ConnectionFailed integrationName={integrationName} error={error} />;

  return (
    <>
      <PageTitle title={`Connecting ${integrationName} Integration`} />
      <PageLoader text={`Connecting ${integrationName}...`} />
    </>
  );
};
