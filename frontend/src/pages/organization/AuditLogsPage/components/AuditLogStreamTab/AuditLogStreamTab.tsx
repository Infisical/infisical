import { PlusIcon } from "lucide-react";

import { AuditLogStreamsUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp, useScopeVariant } from "@app/hooks";

import { AuditLogStreamTable } from "./components/AuditLogStreamTable";
import { AddAuditLogStreamModal, AuditLogStreamAlertAction } from "./components";

export const AuditLogStreamsTab = withPermission(
  () => {
    const { subscription } = useSubscription();
    const scopeVariant = useScopeVariant();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "auditLogStreamForm",
      "upgradePlan"
    ] as const);

    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>
              Audit Log Streams
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams" />
            </CardTitle>
            <CardDescription>
              Send audit logs from Infisical to external logging providers via HTTP
            </CardDescription>
            <CardAction className="flex items-center gap-2">
              <AuditLogStreamAlertAction />
              <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Settings}>
                {(isAllowed) => (
                  <Button
                    variant={scopeVariant}
                    isDisabled={!isAllowed}
                    onClick={() => {
                      if (subscription && !subscription?.auditLogStreams) {
                        handlePopUpOpen("upgradePlan", {
                          isEnterpriseFeature: true
                        });
                        return;
                      }
                      handlePopUpOpen("auditLogStreamForm");
                    }}
                  >
                    <PlusIcon />
                    Add Log Stream
                  </Button>
                )}
              </OrgPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            <AuditLogStreamTable />
          </CardContent>
        </Card>
        <AddAuditLogStreamModal
          isOpen={popUp.auditLogStreamForm.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("auditLogStreamForm", isOpen)}
        />
        <UpgradeGate
          paywallKey="organization.audit-log-stream"
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          intent={{
            ...AuditLogStreamsUpgradeIntent,
            isEnterpriseFeature: Boolean(popUp.upgradePlan.data?.isEnterpriseFeature)
          }}
        />
      </>
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.Settings,
    accessRestrictedMode: "dialog"
  }
);
