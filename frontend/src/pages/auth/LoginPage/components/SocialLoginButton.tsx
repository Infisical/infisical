import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, ButtonBadge } from "@app/components/v3";

type Props = {
  icon: IconDefinition;
  label: string;
  onClick: () => void;
  showLabel?: boolean;
  showLastUsed?: boolean;
};

export const SocialLoginButton = ({ icon, label, onClick, showLabel, showLastUsed }: Props) => (
  <div className="min-w-0 flex-1">
    <Button aria-label={label} variant="outline" size="lg" isFullWidth onClick={onClick}>
      <FontAwesomeIcon icon={icon} />
      {showLabel && <span className="min-w-0 truncate">{label}</span>}
      {showLastUsed && <ButtonBadge variant="project">Last used</ButtonBadge>}
    </Button>
  </div>
);
