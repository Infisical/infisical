import { Spinner } from "@app/components/v2";
import {
  PAM_DISCOVERY_TYPE_MAP,
  PamDiscoveryType,
  useListPamDiscoverySourceOptions
} from "@app/hooks/api/pamDiscovery";

type Props = {
  onSelect: (discoveryType: PamDiscoveryType) => void;
};

export const DiscoveryTypeSelect = ({ onSelect }: Props) => {
  const { isPending, data: discoveryOptions } = useListPamDiscoverySourceOptions();

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Loading options...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {(discoveryOptions || []).map((option) => {
        const details = PAM_DISCOVERY_TYPE_MAP[option.discoveryType];
        return (
          <button
            key={option.discoveryType}
            type="button"
            onClick={() => onSelect(option.discoveryType)}
            className="group flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
          >
            <div className="relative my-auto">
              <img
                src={`/images/integrations/${details.image}`}
                className="size-10"
                alt={`${details.name} logo`}
              />
            </div>
            <div className="max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
              {details.name}
            </div>
          </button>
        );
      })}
    </div>
  );
};
