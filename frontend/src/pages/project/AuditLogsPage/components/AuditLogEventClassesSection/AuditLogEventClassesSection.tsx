import { AuditLogEventClassesForm } from "@app/components/auditLogSettings";
import {
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { useScopeVariant } from "@app/hooks";
import { useGetProjectAuditLogSettings, useUpdateProjectAuditLogSettings } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

export const AuditLogEventClassesSection = () => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const scopeVariant = useScopeVariant();
  const canEdit = permission.can(
    ProjectPermissionAuditLogsActions.Edit,
    ProjectPermissionSub.AuditLogs
  );

  const { data: settings, isPending, isError } = useGetProjectAuditLogSettings(currentProject.id);
  const { mutateAsync: updateSettings, isPending: isSaving } = useUpdateProjectAuditLogSettings();

  return (
    <AuditLogEventClassesForm
      title="Event Classes"
      description={
        currentProject.type === ProjectType.CertificateManager
          ? "Choose which classes of Certificate Manager events are recorded."
          : "Choose which classes of events this project records."
      }
      settings={settings}
      isPending={isPending}
      isError={isError}
      isSaving={isSaving}
      canEdit={canEdit}
      readOnlyMessage="You need the Edit permission on Audit Logs to change these settings."
      variant={scopeVariant}
      paywallKey="project.audit-log-settings"
      onSave={(eventClasses) => updateSettings({ projectId: currentProject.id, eventClasses })}
    />
  );
};
