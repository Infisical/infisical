/* eslint-disable @typescript-eslint/no-unused-vars */
import { useRouter } from "next/router";
import { faChevronLeft, faEllipsis, faRefresh, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { integrationSlugNameMapping } from "public/data/frequentConstants";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useUser,
  useWorkspace
} from "@app/context";
import { useGetIntegration } from "@app/hooks/api";
import { useSyncIntegration } from "@app/hooks/api/integrations/queries";

import { IntegrationAuditLogsSection } from "./components/IntegrationAuditLogsSection";
import { IntegrationConnectionSection } from "./components/IntegrationConnectionSection";
import { IntegrationDetailsSection } from "./components/IntegrationDetailsSection";
import { IntegrationSettingsSection } from "./components/IntegrationSettingsSection";

export const IntegrationDetailsPage = () => {
  const router = useRouter();
  const integrationId = router.query.integrationId as string;

  const { data: integration } = useGetIntegration(integrationId, {
    refetchInterval: 4000
  });

  const projectId = useWorkspace().currentWorkspace?.id;
  const { mutateAsync: syncIntegration } = useSyncIntegration();
  const { currentOrg } = useOrganization();

  return integration ? (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
        <Button
          variant="link"
          type="submit"
          leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
          onClick={() => {
            router.push(`/integrations/${projectId}`);
          }}
          className="mb-4"
        >
          Integrations
        </Button>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-3xl font-semibold text-white">
            {integrationSlugNameMapping[integration.integration]} Integration
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="rounded-lg">
              <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                <Tooltip content="More options">
                  <FontAwesomeIcon size="sm" icon={faEllipsis} />
                </Tooltip>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-1">
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
              <OrgPermissionCan I={OrgPermissionActions.Delete} a={OrgPermissionSubjects.Member}>
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
        </div>

        <div className="flex justify-center">
          <div className="mr-4 w-96">
            <IntegrationDetailsSection integration={integration} />
            <IntegrationConnectionSection integration={integration} />
          </div>
          <div className="space-y-4">
            <IntegrationSettingsSection integration={integration} />
            <IntegrationAuditLogsSection orgId={currentOrg?.id || ""} integration={integration} />
          </div>
        </div>
      </div>
    </div>
  ) : null;
};
