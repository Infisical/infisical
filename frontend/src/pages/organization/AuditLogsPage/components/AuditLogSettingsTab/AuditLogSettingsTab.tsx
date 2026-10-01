import { AuditLogEventClassesForm } from "@app/components/auditLogSettings";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { withPermission } from "@app/hoc";
import { useScopeVariant } from "@app/hooks";
import { useGetOrgAuditLogSettings, useUpdateOrgAuditLogSettings } from "@app/hooks/api";

export const AuditLogSettingsTab = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const { permission } = useOrgPermission();
    const scopeVariant = useScopeVariant();
    const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const { data: settings, isPending } = useGetOrgAuditLogSettings(currentOrg.id);
    const { mutateAsync: updateSettings, isPending: isSaving } = useUpdateOrgAuditLogSettings(
      currentOrg.id
    );

    return (
      <AuditLogEventClassesForm
        title="Event Classes"
        description="Choose which classes of organization-level events are recorded. Each project has its own setting for its events."
        settings={settings}
        isPending={isPending}
        isSaving={isSaving}
        canEdit={canEdit}
        variant={scopeVariant}
        onSave={(eventClasses) => updateSettings({ eventClasses })}
      />
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.Settings,
    accessRestrictedMode: "dialog"
  }
);
