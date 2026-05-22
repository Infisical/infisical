import { useFormContext } from "react-hook-form";
import { EyeIcon } from "lucide-react";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Table, TBody, Td, Th, THead, Tooltip, Tr } from "@app/components/v2";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

export const AwsSecretsManagerSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSSecretsManager }
  >();

  const [region, mappingBehavior, secretName] = watch([
    "destinationConfig.region",
    "destinationConfig.mappingBehavior",
    "destinationConfig.secretName"
  ]);

  const awsRegion = AWS_REGIONS.find((r) => r.slug === region);

  return (
    <>
      <Detail>
        <DetailLabel>Region</DetailLabel>
        <DetailValue className="flex items-center gap-1">
          {awsRegion?.name}
          <Badge variant="success">{awsRegion?.slug}</Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Mapping Behavior</DetailLabel>
        <DetailValue className="capitalize">{mappingBehavior}</DetailValue>
      </Detail>
      {mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne && (
        <Detail>
          <DetailLabel>Secret Name</DetailLabel>
          <DetailValue>{secretName}</DetailValue>
        </Detail>
      )}
    </>
  );
};

export const AwsSecretsManagerSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSSecretsManager }
  >();

  const [{ keyId, tags, syncSecretMetadataAsTags }] = watch(["syncOptions"]);

  return (
    <>
      {keyId && (
        <Detail>
          <DetailLabel>KMS Key</DetailLabel>
          <DetailValue>{keyId}</DetailValue>
        </Detail>
      )}
      {tags && tags.length > 0 && (
        <Detail>
          <DetailLabel>Tags</DetailLabel>
          <DetailValue>
            <Tooltip
              side="right"
              className="max-w-xl p-1"
              content={
                <Table>
                  <THead>
                    <Th className="p-2 whitespace-nowrap">Key</Th>
                    <Th className="p-2">Value</Th>
                  </THead>
                  <TBody>
                    {tags.map((tag) => (
                      <Tr key={tag.key}>
                        <Td className="p-2">{tag.key}</Td>
                        <Td className="p-2">{tag.value}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              }
            >
              <div className="w-min">
                <Badge variant="neutral">
                  <EyeIcon />
                  {tags.length} Tag{tags.length > 1 ? "s" : ""}
                </Badge>
              </div>
            </Tooltip>
          </DetailValue>
        </Detail>
      )}
      {syncSecretMetadataAsTags && (
        <Detail>
          <DetailLabel>Sync Secret Metadata as Resource Tags</DetailLabel>
          <DetailValue>
            <Badge variant="success">Enabled</Badge>
          </DetailValue>
        </Detail>
      )}
    </>
  );
};
