import { NoticeBanner } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { LogsSection } from "./components";

export const AuditLogsPage = withPermission(
  () => {
    return (
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <div className="bg-bunker-800 py-6">
            <p className="text-3xl font-semibold text-gray-200">Audit Logs</p>
            {(window.location.origin.includes("https://app.infisical.com") ||
              window.location.origin.includes("https://gamma.infisical.com")) && (
              <NoticeBanner title="The audit logs page is in maintenance" className="mt-4">
                We are currently working on improving the performance of querying audit logs.
                However, please note that audit logs are still being published as usual, so there’s
                no disruption to log generation.
              </NoticeBanner>
            )}
            <div />
          </div>
          <LogsSection filterClassName="static p-2" showFilters isOrgAuditLogs />
        </div>
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.AuditLogs }
);
