import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type ProviderDetails = {
  label: string;
  image: string;
  value: string;
  docsUrl: string;
};

type Props = {
  providerDetails: ProviderDetails;
  isConnected: boolean;
};

const docsBaseUrl = "https://infisical.com/docs/documentation/platform/sso";

export const SSOModalHeader = ({ providerDetails, isConnected }: Props) => {
  return (
    <div className="mb-4 flex w-full items-start gap-2 border-b border-mineshaft-500 pb-4">
      <img
        alt={`${providerDetails.label} logo`}
        src={`/images/sso/${providerDetails.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center text-mineshaft-300">
          {providerDetails.label}
          <a
            href={`${docsBaseUrl}/${providerDetails.docsUrl}`}
            target="_blank"
            className="mb-1 ml-1"
            rel="noopener noreferrer"
          >
            <div className="inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mb-[0.03rem] mr-1 text-[12px]" />
              <span>Docs</span>
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.07rem] ml-1 text-[10px]"
              />
            </div>
          </a>
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {isConnected
            ? `${providerDetails.label} Connection`
            : `Connect to ${providerDetails.label}`}
        </p>
      </div>
    </div>
  );
};
