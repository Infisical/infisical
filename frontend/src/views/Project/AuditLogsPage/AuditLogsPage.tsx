import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { LogsSection } from "./components";

export const AuditLogsPage = withProjectPermission(
  () => {
    return (
      <div className="flex justify-center bg-bunker-800 text-white w-full h-full">
        <div className="max-w-7xl px-6 w-full">
          <div className="py-6 sticky top-0 z-10 bg-bunker-800">
            <p className="text-3xl font-semibold text-gray-200">Audit Logs</p>
            <div />
          </div>
          <LogsSection />
        </div>
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.AuditLogs }
);
