import { useTranslation } from "react-i18next";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { DeleteActionModal, Skeleton, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { IntegrationAuth, TCloudIntegration } from "@app/hooks/api/types";

type Props = {
  isLoading?: boolean;
  integrationAuths?: Record<string, IntegrationAuth>;
  cloudIntegrations?: TCloudIntegration[];
  onIntegrationStart: (slug: string) => void;
  // cb: handle popUpClose child->parent communication pattern
  onIntegrationRevoke: (slug: string, cb: () => void) => void;
};

type TRevokeIntegrationPopUp = { provider: string };

export const CloudIntegrationSection = ({
  isLoading,
  cloudIntegrations = [],
  integrationAuths = {},
  onIntegrationStart,
  onIntegrationRevoke
}: Props) => {
  const { t } = useTranslation();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation"
  ] as const);
  const permission = useProjectPermission();
  const { createNotification } = useNotificationContext();

  const isEmpty = !isLoading && !cloudIntegrations?.length;

  const sortedCloudIntegrations = cloudIntegrations.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="m-4 mt-7 flex max-w-5xl flex-col items-start justify-between px-2 text-xl">
        <h1 className="text-3xl font-semibold">{t("integrations.cloud-integrations")}</h1>
        <p className="text-base text-gray-400">{t("integrations.click-to-start")}</p>
      </div>
      <div className="mx-6 grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {isLoading &&
          Array.from({ length: 12 }).map((_, index) => (
            <Skeleton className="h-32" key={`cloud-integration-skeleton-${index + 1}`} />
          ))}
        {!isLoading &&
          sortedCloudIntegrations?.map((cloudIntegration) => (
            <div
              onKeyDown={() => null}
              role="button"
              tabIndex={0}
              className={`group relative ${
                cloudIntegration.isAvailable
                  ? "cursor-pointer duration-200 hover:bg-mineshaft-700"
                  : "opacity-50"
              } flex h-32 flex-row items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4`}
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
                height={70}
                width={70}
                alt="integration logo"
              />
              <div className="ml-4 max-w-xs text-xl font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
                {cloudIntegration.name}
              </div>
              {cloudIntegration.isAvailable &&
                Boolean(integrationAuths?.[cloudIntegration.slug]) && (
                  <div className="absolute top-0 right-0 z-40 h-full">
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
          ))}
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
