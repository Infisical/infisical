import { AuditLogEventClassesForm } from "@app/components/auditLogSettings";
import {
  ProjectPermissionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { useGetProjectAuditLogSettings, useUpdateProjectAuditLogSettings } from "@app/hooks/api";

const AuditLogEventClassesSectionContent = () => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const canEdit = permission.can(
    ProjectPermissionAuditLogsActions.Edit,
    ProjectPermissionSub.AuditLogs
  );

  const { data: settings, isPending, isError } = useGetProjectAuditLogSettings(currentProject.id);
  const { mutateAsync: updateSettings, isPending: isSaving } = useUpdateProjectAuditLogSettings();

  return (
    <AuditLogEventClassesForm
      className="mb-6"
      titleClassName="font-alliance"
      title="Audit Log Event Classes"
      description="Choose which classes of events this project records."
      settings={settings}
      isPending={isPending}
      isError={isError}
      isSaving={isSaving}
      canEdit={canEdit}
      readOnlyMessage="You need the Edit Settings permission on Audit Logs to change these settings."
      variant="project"
      onSave={(eventClasses) => updateSettings({ projectId: currentProject.id, eventClasses })}
    />
  );
};

export const AuditLogEventClassesSection = () => {
  const { permission } = useProjectPermission();
  if (!permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings)) return null;
  return <AuditLogEventClassesSectionContent />;
};
