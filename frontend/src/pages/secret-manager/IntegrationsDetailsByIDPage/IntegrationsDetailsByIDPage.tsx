import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faRefresh, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  PageHeader,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionActions, OrgPermissionSubjects, useWorkspace } from "@app/context";
import { useGetIntegration } from "@app/hooks/api";
import { useSyncIntegration } from "@app/hooks/api/integrations/queries";

import { IntegrationAuditLogsSection } from "./components/IntegrationAuditLogsSection";
import { IntegrationConnectionSection } from "./components/IntegrationConnectionSection";
import { IntegrationDetailsSection } from "./components/IntegrationDetailsSection";
import { IntegrationSettingsSection } from "./components/IntegrationSettingsSection";
import { integrationSlugNameMapping } from "./IntegrationsDetailsByIDPage.utils";

export const IntegrationDetailsByIDPage = () => {
  const { t } = useTranslation();
  const integrationId = useParams({
    from: ROUTE_PATHS.SecretManager.IntegrationDetailsByIDPage.id,
    select: (el) => el.integrationId
  });

  const { data: integration } = useGetIntegration(integrationId, {
    refetchInterval: 4000
  });

  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace.id;
  const { mutateAsync: syncIntegration } = useSyncIntegration();

  return (
    <>
      <Helmet>
        <title>Integration Details | Infisical</title>
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta name="og:description" content={t("integrations.description") as string} />
      </Helmet>
      <div className="mx-auto flex max-w-7xl flex-col justify-between bg-bunker-800 text-white">
        {integration ? (
          <div className="mx-auto mb-6 w-full max-w-7xl">
            <PageHeader
              title={`${integrationSlugNameMapping[integration.integration]} Integration`}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="rounded-lg">
                  <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                    <Tooltip content="More options">
                      <Button variant="outline_bg">More</Button>
                    </Tooltip>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="p-1">
                  <DropdownMenuItem
                    onClick={async () => {
                      await syncIntegration({
                        id: integration.id,
                        lastUsed: integration.lastUsed!,
                        workspaceId: projectId!
                      });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faRefresh} />
                      Manually Sync
                    </div>
                  </DropdownMenuItem>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Delete}
                    a={OrgPermissionSubjects.Member}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          isAllowed
                            ? "hover:!bg-red-500 hover:!text-white"
                            : "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() => {}}
                        disabled={!isAllowed}
                      >
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon icon={faTrash} />
                          Delete Integration
                        </div>
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageHeader>
            <div className="flex">
              <div className="mr-4 w-96">
                <IntegrationDetailsSection integration={integration} />
                <IntegrationConnectionSection integration={integration} />
              </div>
              <div className="flex-grow space-y-4">
                <IntegrationSettingsSection integration={integration} />
                <IntegrationAuditLogsSection integration={integration} />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <EmptyState title="Error: Unable to fetch integration." className="py-12" />
          </div>
        )}
      </div>
    </>
  );
};
