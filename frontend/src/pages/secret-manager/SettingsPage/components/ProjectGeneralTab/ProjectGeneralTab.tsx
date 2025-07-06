import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";
import { useWorkspace } from "@app/context";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { BackfillSecretReferenceSecretion } from "../BackfillSecretReferenceSection";
import { DeleteProjectProtection } from "../DeleteProjectProtection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { EnvironmentSection } from "../EnvironmentSection";
import { PointInTimeVersionLimitSection } from "../PointInTimeVersionLimitSection";
import { SecretSharingSection } from "../SecretSharingSection";
import { SecretSnapshotsLegacySection } from "../SecretSnapshotsLegacySection";
import { SecretTagsSection } from "../SecretTagsSection";

export const ProjectGeneralTab = () => {
  const { currentWorkspace } = useWorkspace();
  const isSecretManager = currentWorkspace?.type === ProjectType.SecretManager;

  return (
    <div>
      <ProjectOverviewChangeSection showSlugField />
      {isSecretManager && <EnvironmentSection />}
      {isSecretManager && <SecretTagsSection />}
      {isSecretManager && <AutoCapitalizationSection />}
      {isSecretManager && <SecretSharingSection />}
      {isSecretManager && <SecretSnapshotsLegacySection />}
      {isSecretManager && <PointInTimeVersionLimitSection />}
      <AuditLogsRetentionSection />
      {isSecretManager && <BackfillSecretReferenceSecretion />}
      <DeleteProjectProtection />
      <DeleteProjectSection />
    </div>
  );
};
