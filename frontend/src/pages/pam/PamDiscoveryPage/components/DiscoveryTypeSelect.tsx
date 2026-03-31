import { Button, Label } from "@app/components/v3";
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
      <div className="flex h-full items-center justify-center">
        <Label>Loading options...</Label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {(discoveryOptions || []).map((option) => {
        const details = PAM_DISCOVERY_TYPE_MAP[option.discoveryType];
        return (
          <Button
            key={option.discoveryType}
            onClick={() => onSelect(option.discoveryType)}
            size="lg"
            variant="neutral"
            className="w-full"
          >
            <img
              src={`/images/integrations/${details.image}`}
              className="size-6"
              alt={`${details.name} logo`}
            />
            <Label className="pointer-events-none">{details.name}</Label>
          </Button>
        );
      })}
    </div>
  );
};
