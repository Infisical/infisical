import { PAM_DISCOVERY_TYPE_MAP, PamDiscoveryType } from "@app/hooks/api/pamDiscovery";

type Props = {
  discoveryType: PamDiscoveryType;
  onBack?: () => void;
};

export const PamDiscoverySourceHeader = ({ discoveryType, onBack }: Props) => {
  const details = PAM_DISCOVERY_TYPE_MAP[discoveryType];

  return (
    <div className="mb-4 flex w-full items-start gap-2 border-b border-mineshaft-500 pb-4">
      <img
        alt={`${details.name} logo`}
        src={`/images/integrations/${details.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="text-mineshaft-300">{details.name}</div>
        <p className="text-sm leading-4 text-mineshaft-400">Discovery Source</p>
      </div>
      {onBack && (
        <button
          type="button"
          className="mt-1 ml-auto text-xs text-mineshaft-400 underline underline-offset-2 hover:text-mineshaft-300"
          onClick={onBack}
        >
          Select another discovery type
        </button>
      )}
    </div>
  );
};
