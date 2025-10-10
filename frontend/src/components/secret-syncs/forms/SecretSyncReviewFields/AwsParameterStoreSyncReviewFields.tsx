import { useFormContext } from "react-hook-form";
import { faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Table, TBody, Td, Th, THead, Tooltip, Tr } from "@app/components/v2";
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
                  <Th className="whitespace-nowrap p-2">Key</Th>
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
              <Badge className="bg-mineshaft-400/50 text-bunker-300 flex h-5 w-min items-center gap-1.5 whitespace-nowrap">
                <FontAwesomeIcon icon={faEye} />
                <span>
                  {tags.length} Tag{tags.length > 1 ? "s" : ""}
                </span>
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
