import { useState } from "react";
import Link from "next/link";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { EmptyState, IconButton, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { OrgUser } from "@app/hooks/api/types";
import { LogsSection } from "@app/views/Project/AuditLogsPage/components";

type Props = {
  orgMembership: OrgUser;
};

export const UserAuditLogsSection = withPermission(
  ({ orgMembership }: Props) => {
    const [showFilter, setShowFilter] = useState(false);
    const { subscription, isLoading } = useSubscription();

    // eslint-disable-next-line no-nested-ternary
    return subscription?.auditLogs ? (
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <p className="text-lg font-semibold text-gray-200">Audit Logs</p>

          <Tooltip content="Show audit log filters">
            <IconButton
              colorSchema="primary"
              ariaLabel="copy icon"
              variant="plain"
              className="group relative"
              onClick={() => setShowFilter(!showFilter)}
            >
              <div className="flex items-center space-x-2">
                <p>Filter</p>
                <FontAwesomeIcon icon={faFilter} />
              </div>
            </IconButton>
          </Tooltip>
        </div>
        <LogsSection
          showFilters={showFilter}
          filterClassName="bg-mineshaft-900 static"
          presets={{
            actorId: orgMembership.user.id
          }}
          isOrgAuditLogs
        />
      </div>
    ) : !isLoading ? (
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <p className="text-lg font-semibold text-gray-200">Audit Logs</p>
        </div>
        <EmptyState
          className="rounded-lg"
          title={
            <div>
              <p>
                Please{" "}
                <Link
                  href={
                    subscription && subscription.slug !== null
                      ? `/org/${orgMembership.organization}/billing`
                      : "https://infisical.com/scheduledemo"
                  }
                  passHref
                >
                  <a
                    className="cursor-pointer font-medium text-primary-500 transition-all hover:text-primary-600"
                    target="_blank"
                  >
                    upgrade your subscription
                  </a>
                </Link>{" "}
                to view audit logs for this user
              </p>
            </div>
          }
        />
      </div>
    ) : null;
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Member }
);
