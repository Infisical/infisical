import { useWorkspace } from "@app/context";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { BackfillSecretReferenceSecretion } from "../BackfillSecretReferenceSection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { EnvironmentSection } from "../EnvironmentSection";
import { PointInTimeVersionLimitSection } from "../PointInTimeVersionLimitSection";
import { ProjectNameChangeSection } from "../ProjectNameChangeSection";
import { RebuildSecretIndicesSection } from "../RebuildSecretIndicesSection/RebuildSecretIndicesSection";
import { SecretTagsSection } from "../SecretTagsSection";

export const ProjectGeneralTab = () => {
  const { currentWorkspace } = useWorkspace();

  return (
    <div>
      <ProjectNameChangeSection />
      <EnvironmentSection />
      <SecretTagsSection />
      <AutoCapitalizationSection />
      <PointInTimeVersionLimitSection />
      <AuditLogsRetentionSection />
      <BackfillSecretReferenceSecretion />
      {currentWorkspace?.version !== ProjectVersion.V3 && <RebuildSecretIndicesSection />}
      <DeleteProjectSection />
    </div>
  );
};
