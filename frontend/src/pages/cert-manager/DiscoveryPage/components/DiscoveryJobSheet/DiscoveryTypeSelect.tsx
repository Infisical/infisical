import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import { PkiDiscoveryType } from "@app/hooks/api/pkiDiscovery/types";

import { DiscoveryTypeIcon } from "./DiscoveryTypeIcon";

type Props = {
  onSelect: (type: PkiDiscoveryType) => void;
};

export const DiscoveryTypeSelect = ({ onSelect }: Props) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {Object.values(PkiDiscoveryType).map((type) => {
      const { name, category, description } = PKI_DISCOVERY_TYPE_MAP[type];
      return (
        <button
          key={type}
          type="button"
          onClick={() => onSelect(type)}
          className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover/50"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-hover">
              <DiscoveryTypeIcon type={type} />
            </div>
            <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
              {category}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="text-xs leading-relaxed text-muted">{description}</p>
          </div>
        </button>
      );
    })}
  </div>
);
