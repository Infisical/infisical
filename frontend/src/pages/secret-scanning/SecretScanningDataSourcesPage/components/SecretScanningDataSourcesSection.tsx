import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateSecretScanningDataSourceModal } from "@app/components/secret-scanning";
import { Button, Spinner } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import { ProjectPermissionSub, useProject, useSubscription } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useListSecretScanningDataSources } from "@app/hooks/api/secretScanningV2";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

import { SecretScanningDataSourcesTable } from "./SecretScanningDataSourcesTable";

export const SecretScanningDataSourcesSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addDataSource",
    "upgradePlan"
  ] as const);

  const { subscription } = useSubscription();

  const { currentProject } = useProject();

  const { data: dataSources = [], isPending: isDataSourcesPending } =
    useListSecretScanningDataSources(currentProject.id, {
      refetchInterval: 30000,
      enabled: subscription.get(SubscriptionProductCategory.Platform, "secretScanning")
    });

  if (
    subscription.get(SubscriptionProductCategory.Platform, "secretScanning") &&
    isDataSourcesPending
  )
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-x-2">
              <p className="text-xl font-medium text-mineshaft-100">Data Sources</p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/overview" />
            </div>
            <p className="text-sm text-bunker-300">
              Configure Data Sources to scan for secret leaks from third-party services.
            </p>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningDataSourceActions.Create}
            a={ProjectPermissionSub.SecretScanningDataSources}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => {
                  if (!subscription.get(SubscriptionProductCategory.Platform, "secretScanning")) {
                    handlePopUpOpen("upgradePlan", {
                      isEnterpriseFeature: true
                    });
                    return;
                  }

                  handlePopUpOpen("addDataSource");
                }}
                isDisabled={!isAllowed}
              >
                Add Data Source
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <SecretScanningDataSourcesTable dataSources={dataSources} />
      </div>
      <CreateSecretScanningDataSourceModal
        isOpen={popUp.addDataSource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addDataSource", isOpen)}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Creating data sources can be unlocked if you upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
