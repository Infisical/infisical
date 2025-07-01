import { useWorkspace } from "@app/context";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { BackfillSecretReferenceSecretion } from "../BackfillSecretReferenceSection";
import { EnvironmentSection } from "../EnvironmentSection";
import { PointInTimeVersionLimitSection } from "../PointInTimeVersionLimitSection";
import { RebuildSecretIndicesSection } from "../RebuildSecretIndicesSection/RebuildSecretIndicesSection";
import { SecretSharingSection } from "../SecretSharingSection";
import { SecretSnapshotsLegacySection } from "../SecretSnapshotsLegacySection";
import { SecretTagsSection } from "../SecretTagsSection";

export const ProjectGeneralTab = () => {
  const { currentWorkspace } = useWorkspace();

  return (
    <div>
      <EnvironmentSection />
      <SecretTagsSection />
      <AutoCapitalizationSection />
      <SecretSharingSection />
      <SecretSnapshotsLegacySection />
      <PointInTimeVersionLimitSection />
      <BackfillSecretReferenceSecretion />
      {currentWorkspace?.version !== ProjectVersion.V3 && <RebuildSecretIndicesSection />}
    </div>
  );
};
