import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { DeleteProjectSection } from "../DeleteProjectSection";

export const ProjectGeneralTab = () => {
  return (
    <div>
      <ProjectOverviewChangeSection showSlugField />
      <AuditLogsRetentionSection />
      <DeleteProjectSection />
    </div>
  );
};
