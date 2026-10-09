import { AuditLogEventClassesForm } from "@app/components/auditLogSettings";
import {
  OrgPermissionAuditLogsActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { withPermission } from "@app/hoc";
import { useScopeVariant } from "@app/hooks";
import { useGetOrgAuditLogSettings, useUpdateOrgAuditLogSettings } from "@app/hooks/api";

import { AuditLogStreamAlertsCard } from "./AuditLogStreamAlertsCard";

export const AuditLogSettingsTab = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const { permission } = useOrgPermission();
    const scopeVariant = useScopeVariant();
    const canEdit = permission.can(
      OrgPermissionAuditLogsActions.Edit,
      OrgPermissionSubjects.AuditLogs
    );

    const { data: settings, isPending, isError } = useGetOrgAuditLogSettings(currentOrg.id);
    const { mutateAsync: updateSettings, isPending: isSaving } = useUpdateOrgAuditLogSettings(
      currentOrg.id
    );

    return (
      <div className="flex flex-col gap-y-5">
        <AuditLogEventClassesForm
          title="Event Classes"
          description="Choose which classes of organization-level events are recorded. Each project has its own setting for its events."
          settings={settings}
          isPending={isPending}
          isError={isError}
          isSaving={isSaving}
          canEdit={canEdit}
          readOnlyMessage="You need the Edit permission on Audit Logs to change these settings."
          variant={scopeVariant}
          paywallKey="organization.audit-log-settings"
          onSave={(eventClasses) => updateSettings({ eventClasses })}
        />
        <AuditLogStreamAlertsCard />
      </div>
    );
  },
  {
    action: OrgPermissionAuditLogsActions.Read,
    subject: OrgPermissionSubjects.AuditLogs,
    accessRestrictedMode: "dialog"
  }
);
