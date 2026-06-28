import { useServerConfig } from "@app/context";

import { PointInTimeVersionLimitSection } from "../PointInTimeVersionLimitSection";
import { PreferencesSection } from "../PreferencesSection";
import { SecretDetectionIgnoreValuesSection } from "../SecretDetectionIgnoreValuesSection/SecretDetectionIgnoreValuesSection";
import { SecretValidationRulesSection } from "../SecretValidationRulesSection";

export const PoliciesTab = () => {
  const { config } = useServerConfig();

  return (
    <div>
      <SecretValidationRulesSection />
      <PreferencesSection />
      <PointInTimeVersionLimitSection />
      {config.paramsFolderSecretDetectionEnabled && <SecretDetectionIgnoreValuesSection />}
    </div>
  );
};
