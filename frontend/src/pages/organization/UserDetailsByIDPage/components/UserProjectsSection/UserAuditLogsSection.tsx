import { useState } from "react";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { OrgUser } from "@app/hooks/api/types";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

type Props = {
  orgMembership: OrgUser;
};

export const UserAuditLogsSection = withPermission(
  ({ orgMembership }: Props) => {
    const [showFilter, setShowFilter] = useState(false);
    const { subscription } = useSubscription();

    // eslint-disable-next-line no-nested-ternary
    return (
      subscription?.auditLogs && (
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
      )
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Member }
);
