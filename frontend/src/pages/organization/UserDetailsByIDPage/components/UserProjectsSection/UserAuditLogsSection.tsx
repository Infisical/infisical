import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { OrgPermissionMemberActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { OrgUser } from "@app/hooks/api/types";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

type Props = {
  orgMembership: OrgUser;
};

export const UserAuditLogsSection = withPermission(
  ({ orgMembership }: Props) => {
    const { subscription } = useSubscription();

    return (
      subscription?.auditLogs && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Audit Logs</CardTitle>
            <CardDescription>
              Review this user&apos;s activity across the organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LogsSection
              presets={{
                actorId: orgMembership.user.id
              }}
            />
          </CardContent>
        </Card>
      )
    );
  },
  { action: OrgPermissionMemberActions.Read, subject: OrgPermissionSubjects.Member }
);
