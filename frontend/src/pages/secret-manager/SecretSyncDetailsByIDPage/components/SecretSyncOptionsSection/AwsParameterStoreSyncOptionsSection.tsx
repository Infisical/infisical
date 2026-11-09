import { EyeIcon } from "lucide-react";

import {
  Badge,
  Detail,
  DetailLabel,
  DetailValue,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { TAwsParameterStoreSync } from "@app/hooks/api/secretSyncs/types/aws-parameter-store-sync";

type Props = {
  secretSync: TAwsParameterStoreSync;
};

export const AwsParameterStoreSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { keyId, tags, syncSecretMetadataAsTags }
  } = secretSync;

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
          <DetailLabel>Resource Tags</DetailLabel>
          <DetailValue>
            <HoverCard>
              <HoverCardTrigger asChild>
                <span className="inline-block w-min">
                  <Badge variant="neutral">
                    <EyeIcon />
                    {tags.length} Tag{tags.length > 1 ? "s" : ""}
                  </Badge>
                </span>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-fit max-w-xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="p-2 whitespace-nowrap">Key</TableHead>
                      <TableHead className="p-2">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tags.map((tag) => (
                      <TableRow key={tag.key}>
                        <TableCell className="p-2">{tag.key}</TableCell>
                        <TableCell className="p-2">{tag.value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </HoverCardContent>
            </HoverCard>
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
