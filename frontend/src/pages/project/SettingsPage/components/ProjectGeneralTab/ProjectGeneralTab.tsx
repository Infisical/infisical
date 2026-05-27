import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { DeleteProjectProtection } from "../DeleteProjectProtection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { ProjectSecretDownloadFormatSection } from "../ProjectSecretDownloadFormatSection";

export const ProjectGeneralTab = () => {
  return (
    <div>
      <ProjectOverviewChangeSection showSlugField />
      <ProjectSecretDownloadFormatSection />
      <AuditLogsRetentionSection />
      <DeleteProjectProtection />
      <DeleteProjectSection />
    </div>
  );
};
