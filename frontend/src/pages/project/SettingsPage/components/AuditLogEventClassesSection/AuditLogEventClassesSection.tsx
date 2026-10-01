import { AuditLogEventClassesForm } from "@app/components/auditLogSettings";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { useGetProjectAuditLogSettings, useUpdateProjectAuditLogSettings } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const AuditLogEventClassesSectionContent = () => {
  const { currentProject } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

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
      canEdit={isAdmin}
      readOnlyMessage="Only project admins can change these settings."
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
