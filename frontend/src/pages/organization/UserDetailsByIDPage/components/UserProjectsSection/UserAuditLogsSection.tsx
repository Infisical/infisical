import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { OrgUser } from "@app/hooks/api/types";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

type Props = {
  orgMembership: OrgUser;
};

export const UserAuditLogsSection = withPermission(
  ({ orgMembership }: Props) => {
    const { subscription } = useSubscription();

    // eslint-disable-next-line no-nested-ternary
    return (
      subscription?.auditLogs && (
        <div className="border-mineshaft-600 bg-mineshaft-900 w-full rounded-lg border p-4">
          <div className="border-mineshaft-400 mb-4 flex items-center justify-between border-b pb-4">
            <p className="text-lg font-medium text-gray-200">Audit Logs</p>
          </div>
          <LogsSection
            presets={{
              actorId: orgMembership.user.id
            }}
          />
        </div>
      )
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Member }
);
