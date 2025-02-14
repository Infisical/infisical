import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { Button, EmptyState, Tooltip } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useSetupInstanceGatewayConfig, useUpdateInstanceGatewayConfig } from "@app/hooks/api";
import { adminQueryKeys } from "@app/hooks/api/admin/queries";

export const GatewayPanel = () => {
  const { subscription } = useSubscription();
  const { data } = useQuery(adminQueryKeys.getInstanceGatewayConfig());
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["upgradePlan"] as const);

  const setupInstanceConfig = useSetupInstanceGatewayConfig();
  const updateInstanceConfig = useUpdateInstanceGatewayConfig();

  const handleSetupInstance = () => {
    if (!subscription.gateway) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    if (!setupInstanceConfig.isPending) {
      setupInstanceConfig.mutate(undefined, {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: "Instance gateway setup completed"
          });
        }
      });
    }
  };

  const handleUpdateGatewayStatus = ({ isDisabled }: { isDisabled?: boolean }) => {
    if (!updateInstanceConfig.isPending) {
      updateInstanceConfig.mutate(
        { isDisabled },
        {
          onSuccess: () => {
            createNotification({
              type: "success",
              text: "Instance gateway updated"
            });
          }
        }
      );
    }
  };

  if (!data) {
    return (
      <div>
        <EmptyState
          iconSize="3x"
          className="py-12"
          title="The gateway, for instance, has not been set up."
        >
          <Button
            className="mt-4"
            colorSchema="primary"
            size="sm"
            onClick={handleSetupInstance}
            isLoading={setupInstanceConfig.isPending}
          >
            Start Gateway
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="text-xl font-semibold text-mineshaft-100">Gateway</div>
        {data?.isDisabled && (
          <Tooltip content="Gateway is disabled">
            <div className="h-2 w-2 rounded-full bg-red" />
          </Tooltip>
        )}
      </div>
      <div className="mb-4">
        <div className="mb-2 max-w-sm text-sm text-mineshaft-300">
          Infisical Client Root CA Issued At
        </div>
        <div>{format(new Date(data.infisicalClientCaIssuedAt), "yyyy-MM-dd")}</div>
      </div>
      <div>
        <div className="mb-2 max-w-sm text-sm text-mineshaft-300">
          Infisical Client Root CA Seriial Number
        </div>
        <div>{data.infisicalClientCaSerialNumber}</div>
      </div>
      <Button
        className="mt-4"
        colorSchema={data.isDisabled ? "primary" : "danger"}
        size="sm"
        onClick={() => handleUpdateGatewayStatus({ isDisabled: !data?.isDisabled })}
        isLoading={updateInstanceConfig.isPending}
      >
        {data.isDisabled ? "Enable" : "Disable"}
      </Button>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can use Gateway if you switch to Infisical's Enterprise plan."
      />
    </div>
  );
};
