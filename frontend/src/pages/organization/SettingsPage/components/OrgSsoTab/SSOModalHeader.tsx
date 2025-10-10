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
    <div className="border-mineshaft-500 mb-4 flex w-full items-start gap-2 border-b pb-4">
      <img
        alt={`${providerDetails.label} logo`}
        src={`/images/sso/${providerDetails.image}`}
        className="bg-bunker-500 h-12 w-12 rounded-md p-2"
      />
      <div>
        <div className="text-mineshaft-300 flex items-center">
          {providerDetails.label}
          <a
            href={`${docsBaseUrl}/${providerDetails.docsUrl}`}
            target="_blank"
            className="mb-1 ml-1"
            rel="noopener noreferrer"
          >
            <div className="bg-yellow/20 text-yellow inline-block rounded-md px-1.5 text-sm opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mb-[0.03rem] mr-1 text-[12px]" />
              <span>Docs</span>
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.07rem] ml-1 text-[10px]"
              />
            </div>
          </a>
        </div>
        <p className="text-mineshaft-400 text-sm leading-4">
          {isConnected
            ? `${providerDetails.label} Connection`
            : `Connect to ${providerDetails.label}`}
        </p>
      </div>
    </div>
  );
};
