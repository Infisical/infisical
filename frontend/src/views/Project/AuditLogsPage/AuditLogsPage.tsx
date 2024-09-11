import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { LogsSection } from "./components";

export const AuditLogsPage = withProjectPermission(
  () => {
    return (
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <div className="sticky top-0 z-10 bg-bunker-800 py-6">
            <p className="text-3xl font-semibold text-gray-200">Audit Logs</p>
            <div />
          </div>
          <LogsSection showFilters />
        </div>
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.AuditLogs }
);
