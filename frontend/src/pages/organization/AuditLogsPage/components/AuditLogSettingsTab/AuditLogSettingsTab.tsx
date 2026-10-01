import { AuditLogEventClassesForm } from "@app/components/auditLogSettings";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { withPermission } from "@app/hoc";
import { useScopeVariant } from "@app/hooks";
import { useGetOrgAuditLogSettings, useUpdateOrgAuditLogSettings } from "@app/hooks/api";

export const AuditLogSettingsTab = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const { hasOrgRole } = useOrgPermission();
    const scopeVariant = useScopeVariant();
    const canEdit = hasOrgRole(OrgMembershipRole.Admin);

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
