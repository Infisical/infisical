import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { OrgPermissionBillingActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { usePopUp } from "@app/hooks";
import { OrgPlanTable } from "@app/hooks/api/organization/types";
import { SubscriptionProducts } from "@app/hooks/api/types";
import { useMemo } from "react";
import { ManagePlansTable } from "./ManagePlansTable";

type Props = {
  selectedProduct: SubscriptionProducts;
  orgPlan?: OrgPlanTable;
};

export const PlanUsageStats = ({ selectedProduct, orgPlan }: Props) => {
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp(["managePlan"]);

  const metrics = useMemo(() => {
    const selectedPlan = orgPlan?.productRows?.[selectedProduct];
    if (selectedProduct === SubscriptionProducts.CertificateManager) {
      const sanLimit = 3;
      const sanUsed = 1;
      const internalCaUsed = 1;
      const internalCaLimit = 3;
      return [
        {
          type: "san",
          label: "SANs",
          stats: { limit: sanLimit, used: sanUsed }
        },
        {
          type: "internalCa",
          label: "Internal CA",
          stats: { limit: internalCaLimit, used: internalCaUsed }
        }
      ];
    }

    const identityLimit = 3;
    const identityUsed = 1;
    const projectUsed = 1;
    const projectLimit = 3;
    return [
      {
        type: "identities",
        label: "Identities",
        stats: {
          limit: identityLimit,
          available: identityUsed,
          used: identityUsed,
          label: "Identities"
        }
      },
      {
        type: "projects",
        label: "Projects",
        stats: { limit: projectLimit, used: projectUsed, label: "Projects" }
      }
    ];
  }, [orgPlan, selectedProduct]);

  return (
    <div className="flex w-full gap-4">
      <div className="flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
        <p className="mb-2 text-gray-400">Current plan</p>
        <p className="mb-8 text-2xl font-medium text-mineshaft-50 capitalize">
          {subscription?.productPlans?.[selectedProduct]?.split("-").join(" ") || "-"}
        </p>
        {isInfisicalCloud() && (
          <OrgPermissionCan
            I={OrgPermissionBillingActions.ManageBilling}
            a={OrgPermissionSubjects.Billing}
          >
            {(isAllowed) => (
              <Button
                variant="plain"
                colorSchema="secondary"
                type="button"
                onClick={async () => {
                  handlePopUpOpen("managePlan");
                }}
                disabled={!isAllowed}
                className="text-primary"
              >
                Manage plan &rarr;
              </Button>
            )}
          </OrgPermissionCan>
        )}
      </div>
      {metrics.map((el) => {
        if (el.type === "identities") {
          return (
            <div className="flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
              <p className="mb-2 text-gray-400">{el.label}</p>
              <div className="mb-4 flex border-b border-mineshaft-600 pb-4 text-lg text-mineshaft-50 capitalize">
                <div className="mr-2 flex flex-1 justify-between border-r border-mineshaft-400 pr-2">
                  <div>Assigned</div>
                  <div>{el.stats.used}</div>
                </div>
                <div className="flex flex-1 justify-between">
                  <div>Available</div>
                  <div>{(el.stats as { available: number })?.available}</div>
                </div>
              </div>
              <div className="flex justify-between text-lg text-mineshaft-50 capitalize">
                <div>Limit</div>
                <div>{el.stats.limit}</div>
              </div>
            </div>
          );
        }
        return (
          <div className="flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
            <p className="mb-2 text-gray-400">{el.label}</p>
            <div className="mb-4 flex justify-between border-b border-mineshaft-600 pb-4 text-lg text-mineshaft-50 capitalize">
              <div>Active</div>
              <div>{el.stats.used}</div>
            </div>
            <div className="flex justify-between text-lg text-mineshaft-50 capitalize">
              <div>Limit</div>
              <div>{el.stats.limit}</div>
            </div>
          </div>
        );
      })}
      <Modal
        isOpen={popUp.managePlan.isOpen}
        onOpenChange={(open) => handlePopUpToggle("managePlan", open)}
      >
        <ModalContent
          titleClassName="capitalize"
          title={`Manage ${selectedProduct.split("-").join(" ")} plan`}
          subTitle="Upgrade to pro plan to unlock more exciting features or contact sales to obtain enterprise plan"
          className="max-w-7xl"
        >
          <ManagePlansTable
            selectedProduct={selectedProduct}
            onClose={() => handlePopUpClose("managePlan")}
          />
        </ModalContent>
      </Modal>
    </div>
  );
};
