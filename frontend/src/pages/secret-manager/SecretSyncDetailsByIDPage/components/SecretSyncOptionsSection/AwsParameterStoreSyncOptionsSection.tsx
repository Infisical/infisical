import { EyeIcon } from "lucide-react";

import {
  Badge,
  Detail,
  DetailLabel,
  DetailValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block w-min">
                  <Badge variant="neutral">
                    <EyeIcon />
                    {tags.length} Tag{tags.length > 1 ? "s" : ""}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xl bg-background p-1">
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
              </TooltipContent>
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
