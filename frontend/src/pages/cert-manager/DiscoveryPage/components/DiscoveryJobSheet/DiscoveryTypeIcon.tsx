import { GlobeIcon } from "lucide-react";

import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import { PkiDiscoveryType } from "@app/hooks/api/pkiDiscovery/types";

export const DiscoveryTypeIcon = ({
  type,
  className = "h-6 w-6"
}: {
  type: PkiDiscoveryType;
  className?: string;
}) => {
  const { name, image } = PKI_DISCOVERY_TYPE_MAP[type];
  if (!image) return <GlobeIcon className={`${className} text-muted`} />;
  return (
    <ProviderIcon icon={image} alt={`${name} logo`} className={`${className} object-contain`} />
  );
};
