import { Meta } from "@infisical/cipher/ui/text";
import { TooltipText } from "@infisical/cipher/ui/tooltip";

export const NoExpiry = () => (
  <TooltipText asChild content="Doesn't expire">
    <Meta mono={false} role="img" aria-label="Doesn't expire">
      —
    </Meta>
  </TooltipText>
);
