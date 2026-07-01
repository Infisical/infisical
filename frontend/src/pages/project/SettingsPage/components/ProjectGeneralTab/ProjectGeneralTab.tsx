import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { DeleteProjectProtection } from "../DeleteProjectProtection";
import { DeleteProjectSection } from "../DeleteProjectSection";

export const ProjectGeneralTab = () => {
  return (
    <div>
      <ProjectOverviewChangeSection showSlugField />
      <AuditLogsRetentionSection />
      <DeleteProjectProtection />
      <DeleteProjectSection />
    </div>
  );
};
