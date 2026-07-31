import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Separator
} from "@app/components/v3";
import { BOOLEAN_SYNC_OPTION_FIELDS, VALUE_SYNC_OPTION_FIELDS } from "@app/helpers/pkiSyncs";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

const DESTINATION_OWNED_OPTIONS = new Set<string>(["exportFormat"]);

export const PkiSyncOptionsSection = ({ pkiSync }: Props) => {
  const syncOptions = pkiSync.syncOptions as Record<string, unknown> | undefined;

  return (
    <>
      <Separator className="mt-4" />
      <Accordion type="multiple" variant="ghost">
        <AccordionItem value="sync-options">
          <AccordionTrigger>Sync Options</AccordionTrigger>
          <AccordionContent>
            <DetailGroup>
              {BOOLEAN_SYNC_OPTION_FIELDS.map(({ key, label }) => {
                const value = syncOptions?.[key];
                if (typeof value !== "boolean") return null;

                return (
                  <Detail key={key}>
                    <DetailLabel>{label}</DetailLabel>
                    <DetailValue>
                      <Badge variant={value ? "success" : "neutral"}>
                        {value ? "Enabled" : "Disabled"}
                      </Badge>
                    </DetailValue>
                  </Detail>
                );
              })}
              {VALUE_SYNC_OPTION_FIELDS.map(({ key, label }) => {
                if (DESTINATION_OWNED_OPTIONS.has(key)) return null;

                const value = syncOptions?.[key];
                if (value === undefined || value === null || value === "") return null;

                return (
                  <Detail key={key}>
                    <DetailLabel>{label}</DetailLabel>
                    <DetailValue>
                      <Badge variant="neutral" className="max-w-full truncate">
                        {String(value)}
                      </Badge>
                    </DetailValue>
                  </Detail>
                );
              })}
            </DetailGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};
