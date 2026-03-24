import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  icon: IconDefinition;
  label: string;
  onClick: () => void;
  showLastUsed?: boolean;
};

export const SocialLoginButton = ({ icon, label, onClick, showLastUsed }: Props) => (
  <Tooltip disableHoverableContent>
    <TooltipTrigger asChild>
      <div className="relative w-full">
        <Button aria-label={label} variant="outline" size="lg" isFullWidth onClick={onClick}>
          <FontAwesomeIcon icon={icon} className="!size-4" />
        </Button>
        {showLastUsed && (
          <Badge variant="project" className="absolute -top-2 -right-2">
            Last used
          </Badge>
        )}
      </div>
    </TooltipTrigger>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
);
