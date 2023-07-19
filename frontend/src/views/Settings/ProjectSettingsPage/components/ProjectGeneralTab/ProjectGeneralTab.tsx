import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { E2EESection } from "../E2EESection";
import { EnvironmentSection } from "../EnvironmentSection";
import { ProjectIndexSecretsSection } from "../ProjectIndexSecretsSection";
import { ProjectNameChangeSection } from "../ProjectNameChangeSection";
import { SecretTagsSection } from "../SecretTagsSection";

export const ProjectGeneralTab = () => {
    return (
        <div>
            <ProjectNameChangeSection />
            <EnvironmentSection />
            <SecretTagsSection />
            <AutoCapitalizationSection />
            <ProjectIndexSecretsSection />
            <E2EESection />
            <DeleteProjectSection />
        </div>
    );
}