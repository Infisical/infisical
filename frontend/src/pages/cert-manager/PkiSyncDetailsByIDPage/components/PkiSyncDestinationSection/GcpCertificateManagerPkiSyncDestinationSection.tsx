import {
  Badge,
  ButtonGroup,
  Detail,
  DetailLabel,
  DetailValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION,
  GCP_CERTIFICATE_MANAGER_SCOPES,
  TGcpCertificateManagerPkiSync
} from "@app/hooks/api/pkiSyncs/types/gcp-certificate-manager-sync";

type Props = {
  pkiSync: TGcpCertificateManagerPkiSync;
};

export const GcpCertificateManagerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const { gcpProjectId, location, scope, certificateMapBinding } = pkiSync.destinationConfig;
  const { labels } = pkiSync.syncOptions;

  return (
    <>
      <Detail>
        <DetailLabel>GCP Project</DetailLabel>
        <DetailValue>{gcpProjectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Location</DetailLabel>
        <DetailValue>
          <Badge variant="neutral">
            {location === GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION ? "Global" : location}
          </Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>
          <Badge variant="neutral">{GCP_CERTIFICATE_MANAGER_SCOPES[scope]?.label ?? scope}</Badge>
        </DetailValue>
      </Detail>
      {certificateMapBinding && (
        <>
          <Detail>
            <DetailLabel>Certificate Map</DetailLabel>
            <DetailValue>{certificateMapBinding.certificateMap}</DetailValue>
          </Detail>
          {certificateMapBinding.hostname && (
            <Detail>
              <DetailLabel>Hostname</DetailLabel>
              <DetailValue>{certificateMapBinding.hostname}</DetailValue>
            </Detail>
          )}
        </>
      )}
      {labels?.length ? (
        <Detail>
          <DetailLabel>Labels</DetailLabel>
          <DetailValue className="flex flex-wrap gap-2">
            {labels.map(({ key, value }) => (
              <ButtonGroup className="min-w-0" key={key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge isTruncatable>
                      <span>{key}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm break-all">{key}</TooltipContent>
                </Tooltip>
                {value ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" isTruncatable>
                        <span>{value}</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm break-all">{value}</TooltipContent>
                  </Tooltip>
                ) : null}
              </ButtonGroup>
            ))}
          </DetailValue>
        </Detail>
      ) : null}
    </>
  );
};
