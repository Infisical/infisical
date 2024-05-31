import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { BackfillSecretReferenceSecretion } from "../BackfillSecretReferenceSection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { E2EESection } from "../E2EESection";
import { EnvironmentSection } from "../EnvironmentSection";
import { PointInTimeVersionLimitSection } from "../PointInTimeVersionLimitSection";
import { ProjectNameChangeSection } from "../ProjectNameChangeSection";
import { SecretTagsSection } from "../SecretTagsSection";

export const ProjectGeneralTab = () => {
  return (
    <div>
      <ProjectNameChangeSection />
      <EnvironmentSection />
      <SecretTagsSection />
      <AutoCapitalizationSection />
      <E2EESection />
      <PointInTimeVersionLimitSection />
      <BackfillSecretReferenceSecretion />
      <DeleteProjectSection />
    </div>
  );
};
