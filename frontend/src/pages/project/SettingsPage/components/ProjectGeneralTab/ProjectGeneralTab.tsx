import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";

import { DeleteProjectSection } from "../DeleteProjectSection";

export const ProjectGeneralTab = () => {
  return (
    <div>
      <ProjectOverviewChangeSection />
      <DeleteProjectSection />
    </div>
  );
};
