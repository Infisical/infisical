import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  faCheck,
  faChevronLeft,
  faMagnifyingGlass,
  faSearch,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { NoEnvironmentsBanner } from "@app/components/integrations/NoEnvironmentsBanner";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  Input,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { IntegrationAuth, TCloudIntegration } from "@app/hooks/api/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

type Props = {
  isLoading?: boolean;
  integrationAuths?: Record<string, IntegrationAuth>;
  cloudIntegrations?: TCloudIntegration[];
  onIntegrationStart: (slug: string) => void;
  // cb: handle popUpClose child->parent communication pattern
  onIntegrationRevoke: (slug: string, cb: () => void) => void;
  onViewActiveIntegrations?: () => void;
};

type TRevokeIntegrationPopUp = { provider: string };

const SECRET_SYNCS = Object.values(SecretSync) as string[];
const isSecretSyncAvailable = (type: string) => SECRET_SYNCS.includes(type);

export const CloudIntegrationSection = ({
  isLoading,
  cloudIntegrations = [],
  integrationAuths = {},
  onIntegrationStart,
  onIntegrationRevoke,
  onViewActiveIntegrations
}: Props) => {
  const { t } = useTranslation();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation"
  ] as const);
  const { permission } = useProjectPermission();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const isEmpty = !isLoading && !cloudIntegrations?.length;

  const sortedCloudIntegrations = useMemo(() => {
    const sortedIntegrations = cloudIntegrations.sort((a, b) => a.name.localeCompare(b.name));

    if (currentProject?.environments.length === 0) {
      return sortedIntegrations.map((integration) => ({ ...integration, isAvailable: false }));
    }

    return sortedIntegrations;
  }, [cloudIntegrations, currentProject?.environments]);

  const [search, setSearch] = useState("");

  const filteredIntegrations = sortedCloudIntegrations?.filter((cloudIntegration) =>
    cloudIntegration.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div>
      {currentProject?.environments.length === 0 && (
        <div className="px-5">
          <NoEnvironmentsBanner projectId={currentProject.id} />
        </div>
      )}
      <div className="m-4 mt-0 flex flex-col items-start justify-between px-2 text-xl">
        {onViewActiveIntegrations && (
          <Button
            variant="link"
            onClick={onViewActiveIntegrations}
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
          >
            Back to Integrations
          </Button>
        )}
        <div className="flex w-full flex-col justify-between gap-4 whitespace-nowrap lg:flex-row lg:items-end lg:gap-8">
          <div className="flex-1">
            <h1 className="text-3xl font-medium">{t("integrations.cloud-integrations")}</h1>
            <p className="text-base text-gray-400">{t("integrations.click-to-start")}</p>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search cloud integrations..."
            containerClassName="flex-1 h-min text-base"
          />
        </div>
      </div>
      <div className="mx-2 grid grid-cols-3 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
        {isLoading &&
          Array.from({ length: 12 }).map((_, index) => (
            <Skeleton className="h-32" key={`cloud-integration-skeleton-${index + 1}`} />
          ))}

        {!isLoading && filteredIntegrations.length ? (
          filteredIntegrations.map((cloudIntegration) => {
            const syncSlug = cloudIntegration.syncSlug ?? cloudIntegration.slug;
            const isSyncAvailable = isSecretSyncAvailable(syncSlug);

            return (
              <div
                onKeyDown={() => null}
                role="button"
                tabIndex={0}
                className={`group relative ${
                  cloudIntegration.isAvailable
                    ? "cursor-pointer duration-200 hover:bg-mineshaft-700"
                    : "opacity-50"
                } flex h-36 flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3`}
                onClick={() => {
                  if (isSyncAvailable) {
                    navigate({
                      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
                      params: {
                        orgId: currentOrg.id,
                        projectId: currentProject.id
                      },
                      search: {
                        selectedTab: IntegrationsListPageTabs.SecretSyncs,
                        addSync: syncSlug as SecretSync
                      }
                    });
                    return;
                  }
                  if (!cloudIntegration.isAvailable) return;
                  if (
                    permission.cannot(
                      ProjectPermissionActions.Create,
                      ProjectPermissionSub.Integrations
                    )
                  ) {
                    createNotification({
                      type: "error",
                      text: "You do not have permission to create an integration"
                    });
                    return;
                  }
                  onIntegrationStart(cloudIntegration.slug);
                }}
                key={cloudIntegration.slug}
              >
                <div className="m-auto flex flex-col items-center">
                  <img
                    src={`/images/integrations/${cloudIntegration.image}`}
                    height={60}
                    width={60}
                    className="mt-auto"
                    alt="integration logo"
                  />
                  <div
                    className={`mt-2 max-w-xs text-center text-sm font-medium text-gray-300 duration-200 group-hover:text-gray-200 ${isSyncAvailable ? "mb-4" : ""}`}
                  >
                    {cloudIntegration.name}
                  </div>
                </div>
                {cloudIntegration.isAvailable &&
                  Boolean(integrationAuths?.[cloudIntegration.slug]) && (
                    <div className="absolute top-0 right-0 z-30 h-full">
                      <div className="relative h-full">
                        <div className="absolute top-0 right-0 w-24 flex-row items-center overflow-hidden rounded-tr-md rounded-bl-md bg-primary px-2 py-0.5 text-xs whitespace-nowrap text-black opacity-80 transition-all duration-300 group-hover:w-0 group-hover:p-0">
                          <FontAwesomeIcon icon={faCheck} className="mr-2 text-xs" />
                          Authorized
                        </div>
                        <Tooltip content="Revoke Access">
                          <div
                            onKeyDown={() => null}
                            role="button"
                            tabIndex={0}
                            onClick={async (event) => {
                              event.stopPropagation();
                              handlePopUpOpen("deleteConfirmation", {
                                provider: cloudIntegration.slug
                              });
                            }}
                            className="absolute top-0 right-0 flex h-0 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-r-md bg-red text-xs opacity-50 transition-all duration-300 group-hover:h-full hover:opacity-100"
                          >
                            <FontAwesomeIcon icon={faXmark} size="xl" />
                          </div>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                {isSyncAvailable && (
                  <div className="absolute bottom-0 left-0 z-30 h-full w-full">
                    <div className="relative h-full">
                      <div className="absolute bottom-0 left-0 w-full flex-row overflow-hidden rounded-br-md rounded-bl-md bg-yellow/20 px-2 py-0.5 text-center text-xs whitespace-nowrap text-yellow">
                        Secret Sync Available
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <EmptyState
            className="col-span-full h-32 w-full rounded-md bg-transparent pt-14"
            title="No cloud integrations match search..."
            icon={faSearch}
          />
        )}
      </div>
      {isEmpty && (
        <div className="mx-6 grid max-w-5xl grid-cols-4 grid-rows-2 gap-4">
          {Array.from({ length: 16 }).map((_, index) => (
            <div
              key={`dummy-cloud-integration-${index + 1}`}
              className="h-32 animate-pulse rounded-md border border-mineshaft-600 bg-mineshaft-800"
            />
          ))}
        </div>
      )}
      <DeleteActionModal
        isOpen={popUp.deleteConfirmation.isOpen}
        title={`Are you sure you want to revoke access ${
          (popUp?.deleteConfirmation.data as TRevokeIntegrationPopUp)?.provider || " "
        }?`}
        subTitle="This will remove all the secret integration of this provider!!!"
        onChange={(isOpen) => handlePopUpToggle("deleteConfirmation", isOpen)}
        deleteKey={(popUp?.deleteConfirmation?.data as TRevokeIntegrationPopUp)?.provider || ""}
        onDeleteApproved={async () => {
          onIntegrationRevoke(
            (popUp.deleteConfirmation.data as TRevokeIntegrationPopUp)?.provider,
            () => handlePopUpClose("deleteConfirmation")
          );
        }}
      />
    </div>
  );
};
