import { OrgPermissionCan } from "@app/components/permissions";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { AlertResourceType } from "@app/hooks/api/alerts";
import { AlertAction } from "@app/views/Alerts";

export const AuditLogStreamAlertsCard = () => (
  <Card>
    <CardHeader>
      <CardTitle>Log Stream Alerts</CardTitle>
      <CardDescription>
        Get notified when an external log stream cannot be reached and audit log events are being
        dropped.
      </CardDescription>
      <CardAction>
        <AlertAction
          resourceType={AlertResourceType.AuditLogStream}
          renderPermissionGate={(render) => (
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
              {render}
            </OrgPermissionCan>
          )}
        />
      </CardAction>
    </CardHeader>
  </Card>
);
