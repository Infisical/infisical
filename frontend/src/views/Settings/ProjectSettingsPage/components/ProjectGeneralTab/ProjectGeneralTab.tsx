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
  return (
    <div>
      <ProjectNameChangeSection />
      <EnvironmentSection />
      <SecretTagsSection />
      <AutoCapitalizationSection />
      <PointInTimeVersionLimitSection />
      <AuditLogsRetentionSection />
      <BackfillSecretReferenceSecretion />
      <RebuildSecretIndicesSection />
      <DeleteProjectSection />
    </div>
  );
};
