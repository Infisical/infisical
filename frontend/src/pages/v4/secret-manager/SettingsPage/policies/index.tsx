import { Stack } from "@app/components/v4/ui/layout";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretValidationRuleActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { useProjectPermission } from "../../../access/permissions";
import { useProjectScope } from "../../../access/project/scope";
import { useV4Adapter } from "../../../data/adapters";
import { CrossProjectSharingSection } from "./cross-project-sharing";
import { PreferencesSection } from "./preferences";
import { SecretDetectionSection } from "./secret-detection";
import { ValidationRulesSection } from "./validation-rules";
import { VersionRetentionSection } from "./version-retention";

const ADMIN_ONLY = "Only project admins can change this";

export const PoliciesSettings = () => {
  const { orgId, projectId } = useProjectScope();
  const { data: project } = useV4Adapter("projectSettings").useProject(projectId);
  const { permission, isPending } = useProjectPermission(projectId);
  const { data: facts } = useV4Adapter("projectSettings").useMembershipFacts(projectId);
  const { data: gates, isPending: gatesPending } = useV4Adapter("secretPolicies").useGates(orgId);
  if (!project || isPending || gatesPending) return <SettingsCard title="Preferences" loading />;
  const isAdmin = Boolean(facts?.isAdmin);
  const canRule = (action: ProjectPermissionSecretValidationRuleActions) =>
    permission.can(action, ProjectPermissionSub.SecretValidationRules);
  const canEditSettings = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Settings
  );
  return (
    <Stack gap={24}>
      <PreferencesSection project={project} canEdit={canEditSettings} />
      {canRule(ProjectPermissionSecretValidationRuleActions.Read) && (
        <ValidationRulesSection
          project={project}
          permissions={{
            canCreate: canRule(ProjectPermissionSecretValidationRuleActions.Create),
            canEdit: canRule(ProjectPermissionSecretValidationRuleActions.Edit),
            canDelete: canRule(ProjectPermissionSecretValidationRuleActions.Delete),
            canEnableBlindIndex: canEditSettings
          }}
        />
      )}
      {gates?.allowCrossProjectSecretSharing && (
        <CrossProjectSharingSection
          project={project}
          permission={permission}
          inPlan={gates.crossProjectSecretSharingInPlan}
        />
      )}
      <VersionRetentionSection
        key={`retention-${project.id}`}
        project={project}
        lockedReason={isAdmin ? undefined : ADMIN_ONLY}
      />
      {gates?.paramsFolderSecretDetectionEnabled && (
        <SecretDetectionSection
          key={`detection-${project.id}`}
          project={project}
          lockedReason={isAdmin ? undefined : ADMIN_ONLY}
        />
      )}
    </Stack>
  );
};
