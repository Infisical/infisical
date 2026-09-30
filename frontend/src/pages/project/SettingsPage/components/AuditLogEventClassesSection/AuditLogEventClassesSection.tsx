import { AuditLogEventClassesForm } from "@app/components/auditLogSettings";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { useGetProjectAuditLogSettings, useUpdateProjectAuditLogSettings } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

export const AuditLogEventClassesSection = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const { data: settings, isPending } = useGetProjectAuditLogSettings(currentProject.id);
  const { mutateAsync: updateSettings, isPending: isSaving } = useUpdateProjectAuditLogSettings();

  return (
    <AuditLogEventClassesForm
      className="mb-6"
      titleClassName="font-alliance"
      title="Audit Log Event Classes"
      description="Choose which classes of events this project records."
      settings={settings}
      isPending={isPending}
      isSaving={isSaving}
      canEdit={isAdmin}
      variant="project"
      orgId={currentOrg.id}
      shouldUseNewPrivilegeSystem={
        settings?.shouldUseNewPrivilegeSystem ?? currentOrg.shouldUseNewPrivilegeSystem
      }
      onSave={(eventClasses) => updateSettings({ projectId: currentProject.id, eventClasses })}
    />
  );
};
