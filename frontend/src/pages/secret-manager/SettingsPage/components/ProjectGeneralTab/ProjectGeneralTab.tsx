import { AutoCapitalizationSection } from "../AutoCapitalizationSection";
import { BackfillSecretReferenceSecretion } from "../BackfillSecretReferenceSection";
import { EnvironmentSection } from "../EnvironmentSection";
import { PointInTimeVersionLimitSection } from "../PointInTimeVersionLimitSection";
import { SecretSharingSection } from "../SecretSharingSection";
import { SecretSnapshotsLegacySection } from "../SecretSnapshotsLegacySection";
import { SecretTagsSection } from "../SecretTagsSection";

export const SecretSettingsTab = () => {
  return (
    <div>
      <EnvironmentSection />
      <SecretTagsSection />
      <AutoCapitalizationSection />
      <SecretSharingSection />
      <SecretSnapshotsLegacySection />
      <PointInTimeVersionLimitSection />
      <BackfillSecretReferenceSecretion />
    </div>
  );
};
