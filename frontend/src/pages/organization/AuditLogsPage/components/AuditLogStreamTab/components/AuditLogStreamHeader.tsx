import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { DocumentationLinkBadge } from "@app/components/v3";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";

type Props = {
  provider: LogProvider;
  logStreamExists: boolean;
};

export const AuditLogStreamHeader = ({ provider, logStreamExists }: Props) => {
  const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];

  return (
    <div className="flex w-full items-start gap-2">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-container">
        {providerDetails.image ? (
          <img
            alt={providerDetails.name}
            src={`/images/integrations/${providerDetails.image}`}
            className="h-7 w-7 object-contain"
          />
        ) : (
          providerDetails.icon && (
            <FontAwesomeIcon icon={providerDetails.icon} className="text-accent" />
          )
        )}
      </div>
      <div>
        <div className="flex items-center gap-x-2 text-foreground">
          {providerDetails.name}
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams#example-providers" />
        </div>
        <p className="text-sm leading-4 font-normal text-muted">
          {logStreamExists
            ? `${providerDetails.name} Log Stream`
            : `Create a ${providerDetails.name} Log Stream`}
        </p>
      </div>
    </div>
  );
};
