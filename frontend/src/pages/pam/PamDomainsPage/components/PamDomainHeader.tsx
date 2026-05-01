import { PencilIcon } from "lucide-react";

import { Button, Label } from "@app/components/v3";
import { PAM_DOMAIN_TYPE_MAP, PamDomainType } from "@app/hooks/api/pamDomain";

type Props = {
  domainType: PamDomainType;
  onBack?: () => void;
};

export const PamDomainHeader = ({ domainType, onBack }: Props) => {
  const details = PAM_DOMAIN_TYPE_MAP[domainType];

  return (
    <div className="flex w-full items-center gap-2.5 border-b border-border p-3">
      {details?.image && (
        <img
          alt={`${details.name} logo`}
          src={`/images/integrations/${details.image}`}
          className="size-9"
        />
      )}
      <div className="flex w-full flex-col gap-1">
        <Label>{details?.name || domainType}</Label>
        <p className="text-xs text-muted">Domain</p>
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
