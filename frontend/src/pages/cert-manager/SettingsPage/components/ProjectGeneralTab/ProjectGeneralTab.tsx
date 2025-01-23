import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { ProjectOverviewChangeSection } from "../ProjectOverviewChangeSection";

export const ProjectGeneralTab = () => {
  return (
    <div>
      <ProjectOverviewChangeSection />
      <AuditLogsRetentionSection />
      <DeleteProjectSection />
    </div>
  );
};
