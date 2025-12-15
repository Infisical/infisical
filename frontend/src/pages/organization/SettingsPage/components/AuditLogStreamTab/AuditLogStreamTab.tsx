import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

import { AuditLogStreamTable } from "./components/AuditLogStreamTable";
import { AddAuditLogStreamModal } from "./components";

export const AuditLogStreamsTab = withPermission(
  () => {
    const { subscription } = useSubscription();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "auditLogStreamForm",
      "upgradePlan"
    ] as const);

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-between">
          <p className="text-xl font-medium text-mineshaft-100">Audit Log Streams</p>
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Settings}>
            {(isAllowed) => (
              <Button
                onClick={() => {
                  if (
                    subscription &&
                    !subscription?.get(SubscriptionProductCategory.Platform, "auditLogStreams")
                  ) {
                    handlePopUpOpen("upgradePlan", {
                      isEnterpriseFeature: true
                    });
                    return;
                  }
                  handlePopUpOpen("auditLogStreamForm");
                }}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                isDisabled={!isAllowed}
                variant="outline_bg"
                colorSchema="secondary"
              >
                Add Log Stream
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        <p className="mb-8 text-gray-400">
          Send audit logs from Infisical to external logging providers via HTTP
        </p>
        <AuditLogStreamTable />
        <AddAuditLogStreamModal
          isOpen={popUp.auditLogStreamForm.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("auditLogStreamForm", isOpen)}
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Your current plan does not include access to audit log streams. To unlock this feature, please upgrade to Infisical Enterprise plan."
          isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings }
);
