import { useIsMobile } from "@infisical/cipher/hooks/use-mobile";
import { Halftone } from "@infisical/cipher/ui/halftone";

export const ShareHalftone = () => {
  const isMobile = useIsMobile();
  return (
    <Halftone
      anchor="bottom-right"
      tone="ink"
      reach={isMobile ? 160 : 440}
      depth={isMobile ? 0.2 : 0.32}
      intensity={0.75}
      seed="shared-secret"
    />
  );
};
