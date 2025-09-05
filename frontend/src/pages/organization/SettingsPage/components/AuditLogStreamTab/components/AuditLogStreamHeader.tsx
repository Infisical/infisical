import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";

type Props = {
  provider: LogProvider;
  logStreamExists: boolean;
  onBack?: () => void;
};

export const AuditLogStreamHeader = ({ provider, logStreamExists, onBack }: Props) => {
  const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];

  return (
    <div className="mb-4 flex w-full items-center gap-2 border-b border-mineshaft-500 pb-4">
      <div className="relative">
        {providerDetails.image ? (
          <img
            alt={providerDetails.name}
            src={`/images/integrations/${providerDetails.image}`}
            className="size-12 rounded-md bg-bunker-500 p-2"
          />
        ) : (
          providerDetails.icon && (
            <div className="size-12 rounded-md bg-bunker-500 p-2">
              <FontAwesomeIcon
                icon={providerDetails.icon}
                className="h-full w-full text-mineshaft-300"
              />
            </div>
          )
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center text-mineshaft-300">
          {providerDetails.name}
          <a
            href="https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams#example-providers"
            target="_blank"
            className="ml-1"
            rel="noopener noreferrer"
          >
            <div className="inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mb-px mr-1 text-xs" />
              <span>Docs</span>
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="mb-px ml-1 text-[10px]" />
            </div>
          </a>
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {logStreamExists
            ? `${providerDetails.name} Log Stream`
            : `Create a ${providerDetails.name} Log Stream`}
        </p>
      </div>
      {onBack && (
        <button
          type="button"
          className="ml-auto mt-1 text-xs text-mineshaft-400 underline underline-offset-2 hover:text-mineshaft-300"
          onClick={onBack}
        >
          Select another provider
        </button>
      )}
    </div>
  );
};
