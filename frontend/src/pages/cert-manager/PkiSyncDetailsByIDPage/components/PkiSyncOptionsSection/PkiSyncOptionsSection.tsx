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
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

const EnabledBadge = ({ enabled }: { enabled: boolean }) => (
  <Badge variant={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</Badge>
);

export const PkiSyncOptionsSection = ({ pkiSync }: Props) => {
  const {
    syncOptions: {
      canRemoveCertificates,
      certificateNameSchema,
      preserveArn,
      enableVersioning,
      preserveItemOnRenewal,
      updateExistingCertificates
    }
  } = pkiSync;

  return (
    <>
      <Separator className="mt-4" />
      <Accordion type="multiple" variant="ghost">
        <AccordionItem value="sync-options">
          <AccordionTrigger>Sync Options</AccordionTrigger>
          <AccordionContent>
            <DetailGroup>
              <Detail>
                <DetailLabel>Inactive Certificate Removal</DetailLabel>
                <DetailValue>
                  <EnabledBadge enabled={canRemoveCertificates} />
                </DetailValue>
              </Detail>
              {certificateNameSchema && (
                <Detail>
                  <DetailLabel>Certificate Name Schema</DetailLabel>
                  <DetailValue>
                    <Badge variant="neutral" className="max-w-full truncate">
                      {certificateNameSchema}
                    </Badge>
                  </DetailValue>
                </Detail>
              )}
              {preserveArn !== undefined && (
                <Detail>
                  <DetailLabel>Preserve ARN</DetailLabel>
                  <DetailValue>
                    <EnabledBadge enabled={preserveArn} />
                  </DetailValue>
                </Detail>
              )}
              {enableVersioning !== undefined && (
                <Detail>
                  <DetailLabel>Versioning</DetailLabel>
                  <DetailValue>
                    <EnabledBadge enabled={enableVersioning} />
                  </DetailValue>
                </Detail>
              )}
              {preserveItemOnRenewal !== undefined && (
                <Detail>
                  <DetailLabel>Preserve Item on Renewal</DetailLabel>
                  <DetailValue>
                    <EnabledBadge enabled={preserveItemOnRenewal} />
                  </DetailValue>
                </Detail>
              )}
              {updateExistingCertificates !== undefined && (
                <Detail>
                  <DetailLabel>Update Existing Certificates</DetailLabel>
                  <DetailValue>
                    <EnabledBadge enabled={updateExistingCertificates} />
                  </DetailValue>
                </Detail>
              )}
            </DetailGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};
