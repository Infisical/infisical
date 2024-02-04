import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { E2EESection } from "../E2EESection";
import { EnvironmentSection } from "../EnvironmentSection";
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
      <DeleteProjectSection />
    </div>
  );
};
