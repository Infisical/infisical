import { faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge, Table, TBody, Td, Th, THead, Tooltip, Tr } from "@app/components/v2";
import { TAwsSecretsManagerSync } from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

type Props = {
  secretSync: TAwsSecretsManagerSync;
};

export const AwsSecretsManagerSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { keyId, tags, syncSecretMetadataAsTags }
  } = secretSync;

  return (
    <>
      {keyId && <GenericFieldLabel label="KMS Key">{keyId}</GenericFieldLabel>}
      {tags && tags.length > 0 && (
        <GenericFieldLabel label="Tags">
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
        <GenericFieldLabel label="Sync Secret Metadata as Tags">
          <Badge variant="success">Enabled</Badge>
        </GenericFieldLabel>
      )}
    </>
  );
};
