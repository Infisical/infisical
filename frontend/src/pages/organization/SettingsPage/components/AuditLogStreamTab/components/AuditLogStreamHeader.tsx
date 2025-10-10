import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";

type Props = {
  provider: LogProvider;
  logStreamExists: boolean;
  onBack?: () => void;
};

export const AuditLogStreamHeader = ({ provider, logStreamExists, onBack }: Props) => {
  const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];

  return (
    <div className="border-mineshaft-500 mb-4 flex w-full items-center gap-2 border-b pb-4">
      <div className="relative">
        {providerDetails.image ? (
          <img
            alt={providerDetails.name}
            src={`/images/integrations/${providerDetails.image}`}
            className="bg-bunker-500 size-12 rounded-md p-2"
          />
        ) : (
          providerDetails.icon && (
            <div className="bg-bunker-500 size-12 rounded-md p-2">
              <FontAwesomeIcon
                icon={providerDetails.icon}
                className="text-mineshaft-300 h-full w-full"
              />
            </div>
          )
        )}
      </div>
      <div>
        <div className="text-mineshaft-300 mb-1 flex items-center">
          {providerDetails.name}
          <a
            href="https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams#example-providers"
            target="_blank"
            className="ml-1"
            rel="noopener noreferrer"
          >
            <div className="bg-yellow/20 text-yellow inline-block rounded-md px-1.5 text-sm opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mb-px mr-1 text-xs" />
              <span>Docs</span>
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="mb-px ml-1 text-[10px]" />
            </div>
          </a>
        </div>
        <p className="text-mineshaft-400 text-sm leading-4">
          {logStreamExists
            ? `${providerDetails.name} Log Stream`
            : `Create a ${providerDetails.name} Log Stream`}
        </p>
      </div>
      {onBack && (
        <button
          type="button"
          className="text-mineshaft-400 hover:text-mineshaft-300 ml-auto mt-1 text-xs underline underline-offset-2"
          onClick={onBack}
        >
          Select another provider
        </button>
      )}
    </div>
  );
};
