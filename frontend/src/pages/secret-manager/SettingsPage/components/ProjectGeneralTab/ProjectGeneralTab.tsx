import { useServerConfig } from "@app/context";

import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { BackfillSecretReferenceSecretion } from "../BackfillSecretReferenceSection";
import { EnvironmentSection } from "../EnvironmentSection";
import { PointInTimeVersionLimitSection } from "../PointInTimeVersionLimitSection";
import { SecretDetectionIgnoreValuesSection } from "../SecretDetectionIgnoreValuesSection/SecretDetectionIgnoreValuesSection";
import { SecretSharingSection } from "../SecretSharingSection";
import { SecretSnapshotsLegacySection } from "../SecretSnapshotsLegacySection";
import { SecretTagsSection } from "../SecretTagsSection";

export const SecretSettingsTab = () => {
  const { config } = useServerConfig();

  return (
    <div>
      <EnvironmentSection />
      <SecretTagsSection />
      <AutoCapitalizationSection />
      <SecretSharingSection />
      <SecretSnapshotsLegacySection />
      <PointInTimeVersionLimitSection />
      {config.paramsFolderSecretDetectionEnabled && <SecretDetectionIgnoreValuesSection />}
      <BackfillSecretReferenceSecretion />
    </div>
  );
};
