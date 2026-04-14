import { PencilIcon } from "lucide-react";

import { Button, Label } from "@app/components/v3";
import { PAM_DISCOVERY_TYPE_MAP, PamDiscoveryType } from "@app/hooks/api/pamDiscovery";

type Props = {
  discoveryType: PamDiscoveryType;
  onBack?: () => void;
};

export const PamDiscoverySourceHeader = ({ discoveryType, onBack }: Props) => {
  const details = PAM_DISCOVERY_TYPE_MAP[discoveryType];

  return (
    <div className="flex w-full items-center gap-2.5 border-b border-border p-3">
      <img
        alt={`${details.name} logo`}
        src={`/images/integrations/${details.image}`}
        className="size-9"
      />
      <div className="flex w-full flex-col gap-1">
        <Label>{details.name}</Label>
        <p className="text-xs text-muted">Discovery Source</p>
      </div>
      {onBack && (
        <Button size="xs" variant="neutral" onClick={onBack}>
          <PencilIcon />
          Change
        </Button>
      )}
    </div>
  );
};
