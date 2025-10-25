import { useFormContext } from "react-hook-form";
import { EyeIcon } from "lucide-react";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Table, TBody, Td, Th, THead, Tooltip, Tr } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AwsParameterStoreSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSParameterStore }
  >();

  const [{ keyId, tags, syncSecretMetadataAsTags }] = watch(["syncOptions"]);

  return (
    <>
      {keyId && <GenericFieldLabel label="KMS Key">{keyId}</GenericFieldLabel>}
      {tags && tags.length > 0 && (
        <GenericFieldLabel label="Resource Tags">
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
        </GenericFieldLabel>
      )}
      {syncSecretMetadataAsTags && (
        <GenericFieldLabel label="Sync Secret Metadata as Resource Tags">
          <Badge variant="success">Enabled</Badge>
        </GenericFieldLabel>
      )}
    </>
  );
};

export const AwsParameterStoreDestinationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSParameterStore }
  >();

  const [{ region, path }] = watch(["destinationConfig"]);

  const awsRegion = AWS_REGIONS.find((r) => r.slug === region);

  return (
    <>
      <GenericFieldLabel label="Region">
        {awsRegion?.name}
        <Badge className="ml-1" variant="success">
          {awsRegion?.slug}{" "}
        </Badge>
      </GenericFieldLabel>
      <GenericFieldLabel label="Path">{path}</GenericFieldLabel>
    </>
  );
};
