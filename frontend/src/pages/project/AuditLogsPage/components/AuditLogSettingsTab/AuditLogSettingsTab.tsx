import { ProjectPermissionAuditLogsActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { AuditLogEventClassesSection } from "../AuditLogEventClassesSection";
import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";

export const AuditLogSettingsTab = withProjectPermission(
  () => (
    <div className="flex flex-col gap-6">
      <AuditLogEventClassesSection />
      <AuditLogsRetentionSection />
    </div>
  ),
  {
    action: ProjectPermissionAuditLogsActions.Read,
    subject: ProjectPermissionSub.AuditLogs,
    accessRestrictedMode: "dialog"
  }
);
