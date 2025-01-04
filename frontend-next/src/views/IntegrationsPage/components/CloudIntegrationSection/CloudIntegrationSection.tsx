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
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { IntegrationAuth, TCloudIntegration } from "@app/hooks/api/types";

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
  const { currentWorkspace } = useWorkspace();

  const isEmpty = !isLoading && !cloudIntegrations?.length;

  const sortedCloudIntegrations = useMemo(() => {
    const sortedIntegrations = cloudIntegrations.sort((a, b) => a.name.localeCompare(b.name));

    if (currentWorkspace?.environments.length === 0) {
      return sortedIntegrations.map((integration) => ({ ...integration, isAvailable: false }));
    }

    return sortedIntegrations;
  }, [cloudIntegrations, currentWorkspace?.environments]);

  const [search, setSearch] = useState("");

  const filteredIntegrations = sortedCloudIntegrations?.filter((cloudIntegration) =>
    cloudIntegration.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div>
      <div className="px-5">
        {currentWorkspace?.environments.length === 0 && (
          <NoEnvironmentsBanner projectId={currentWorkspace.id} />
        )}
      </div>
      <div className="m-4 mt-7 flex flex-col items-start justify-between px-2 text-xl">
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
            <h1 className="text-3xl font-semibold">{t("integrations.cloud-integrations")}</h1>
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
      <div className="mx-6 grid grid-cols-3 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
        {isLoading &&
          Array.from({ length: 12 }).map((_, index) => (
            <Skeleton className="h-32" key={`cloud-integration-skeleton-${index + 1}`} />
          ))}

        {!isLoading && filteredIntegrations.length ? (
          filteredIntegrations.map((cloudIntegration) => (
            <div
              onKeyDown={() => null}
              role="button"
              tabIndex={0}
              className={`group relative ${
                cloudIntegration.isAvailable
                  ? "cursor-pointer duration-200 hover:bg-mineshaft-700"
                  : "opacity-50"
              } flex h-32 flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4`}
              onClick={() => {
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
              <img
                src={`/images/integrations/${cloudIntegration.image}`}
                height={60}
                width={60}
                className="mt-auto"
                alt="integration logo"
              />
              <div className="mt-auto max-w-xs text-center text-sm font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
                {cloudIntegration.name}
              </div>
              {cloudIntegration.isAvailable &&
                Boolean(integrationAuths?.[cloudIntegration.slug]) && (
                  <div className="absolute top-0 right-0 z-30 h-full">
                    <div className="relative h-full">
                      <div className="absolute top-0 right-0 w-24 flex-row items-center overflow-hidden whitespace-nowrap rounded-tr-md rounded-bl-md bg-primary py-0.5 px-2 text-xs text-black opacity-80 transition-all duration-300 group-hover:w-0 group-hover:p-0">
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
                          className="absolute top-0 right-0 flex h-0 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-r-md bg-red text-xs opacity-50 transition-all duration-300  hover:opacity-100 group-hover:h-full"
                        >
                          <FontAwesomeIcon icon={faXmark} size="xl" />
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                )}
            </div>
          ))
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
        title={`Are you sure want to revoke access ${
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
