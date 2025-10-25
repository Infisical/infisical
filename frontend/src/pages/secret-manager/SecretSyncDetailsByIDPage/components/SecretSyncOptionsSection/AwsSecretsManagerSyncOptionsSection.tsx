import { faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { EyeIcon } from "lucide-react";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Table, TBody, Td, Th, THead, Tooltip, Tr } from "@app/components/v2";
import { Badge } from "@app/components/v3";
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
                <FontAwesomeIcon icon={faEye} />
                {tags.length} Tag{tags.length > 1 ? "s" : ""}
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
