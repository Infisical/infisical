import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";
import { useWorkspace } from "@app/context";
import { ProjectType, ProjectVersion } from "@app/hooks/api/workspace/types";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { BackfillSecretReferenceSecretion } from "../BackfillSecretReferenceSection";
import { DeleteProjectProtection } from "../DeleteProjectProtection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { EnvironmentSection } from "../EnvironmentSection";
import { PointInTimeVersionLimitSection } from "../PointInTimeVersionLimitSection";
import { RebuildSecretIndicesSection } from "../RebuildSecretIndicesSection/RebuildSecretIndicesSection";
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
      {isSecretManager && <PointInTimeVersionLimitSection />}
      <AuditLogsRetentionSection />
      {isSecretManager && <BackfillSecretReferenceSecretion />}
      {currentWorkspace?.version !== ProjectVersion.V3 && isSecretManager && (
        <RebuildSecretIndicesSection />
      )}
      <DeleteProjectProtection />
      <DeleteProjectSection />
    </div>
  );
};
