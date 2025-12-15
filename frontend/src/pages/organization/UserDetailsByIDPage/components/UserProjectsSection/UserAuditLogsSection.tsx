import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
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
      subscription?.get(SubscriptionProductCategory.Platform, "auditLogs") && (
        <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
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
