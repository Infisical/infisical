import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";

type Props = {
  icon: IconDefinition;
  label: string;
  onClick: () => void;
  showLastUsed?: boolean;
};

export const SocialLoginButton = ({ icon, label, onClick, showLastUsed }: Props) => (
  <Tooltip position="bottom" content={label}>
    <div className="relative w-full">
      <IconButton
        ariaLabel={label}
        colorSchema="primary"
        variant="outline_bg"
        onClick={onClick}
        className="h-10 w-full bg-mineshaft-600"
      >
        <FontAwesomeIcon icon={icon} />
      </IconButton>
      {showLastUsed && (
        <Badge variant="project" className="absolute -top-2 -right-2 rounded-full">
          Last used
        </Badge>
      )}
    </div>
  </Tooltip>
);
