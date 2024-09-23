import { TIntegrationWithEnv } from "@app/hooks/api/integrations/types";

type Props = {
  integration: TIntegrationWithEnv;
};

type Metadata = NonNullable<TIntegrationWithEnv["metadata"]>;
type MetadataKey = keyof Metadata;
type MetadataValue<K extends MetadataKey> = Metadata[K];

const metadataMappings: Record<keyof NonNullable<TIntegrationWithEnv["metadata"]>, string> = {
  githubVisibility: "Github Visibility",
  githubVisibilityRepoIds: "Github Visibility Repo Ids",
  shouldAutoRedeploy: "Auto Redeploy Target Application When Secrets Change",
  secretAWSTag: "Tags For Secrets Stored In AWS",
  kmsKeyId: "AWS KMS Key ID",
  secretSuffix: "Secret Suffix",
  secretPrefix: "Secret Prefix",
  syncBehavior: "Secrets Sync behavior",
  mappingBehavior: "Secrets Mapping Behavior",
  scope: "Scope",
  org: "Organization",
  project: "Project",
  environment: "Environment",
  shouldDisableDelete: "AWS Secret Deletion Disabled",
  shouldMaskSecrets: "GitLab Secrets Masking Enabled",
  shouldProtectSecrets: "GitLab Secret Protection Enabled",
  shouldEnableDelete: "GitHub Secret Deletion Enabled"
} as const;

export const IntegrationSettingsSection = ({ integration }: Props) => {
  const renderValue = <K extends MetadataKey>(key: K, value: MetadataValue<K>) => {
    if (!value) return null;

    // If it's a boolean, we render a generic "Yes" or "No" response.
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    // When the value is an object or array, or array of objects, we need to handle some special cases.
    if (typeof value === "object") {
      if (key === "secretAWSTag") {
        return (value as MetadataValue<"secretAWSTag">)!.map(({ key: tagKey, value: tagValue }) => (
          <p key={tagKey} className="text-sm text-gray-200">
            {tagKey}={tagValue}
          </p>
        ));
      }

      if (key === "githubVisibilityRepoIds") {
        return value.join(", ");
      }
    }

    if (typeof value === "string") {
      return value.length ? value : "N/A";
    }

    if (typeof value === "number") {
      return value;
    }

    return null;
  };

  if (!integration.metadata || Object.keys(integration.metadata).length === 0) {
    return null;
  }

  // eslint-disable-next-line no-nested-ternary
  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <p className="text-lg font-semibold text-gray-200">Integration Settings</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {integration.metadata &&
          Object.entries(integration.metadata).map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <p className="text-sm text-gray-400">
                {metadataMappings[key as keyof typeof metadataMappings]}
              </p>
              <p className="text-sm text-gray-200">{renderValue(key as MetadataKey, value)}</p>
            </div>
          ))}
      </div>
    </div>
  );
};
