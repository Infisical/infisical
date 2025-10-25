import { DocumentationLinkBadge } from "@app/components/v3";

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
        <div className="flex items-center gap-x-2 text-mineshaft-300">
          {providerDetails.label}
          <DocumentationLinkBadge href={`${docsBaseUrl}/${providerDetails.docsUrl}`} />
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
