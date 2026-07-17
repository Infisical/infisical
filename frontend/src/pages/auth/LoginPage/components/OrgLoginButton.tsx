import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, ButtonBadge } from "@app/components/v3";

type Props = {
  label: string;
  onClick: () => void;
  className?: string;
  showLastUsed?: boolean;
};

export const OrgLoginButton = ({ label, onClick, className, showLastUsed }: Props) => (
  <Button variant="outline" size="lg" isFullWidth onClick={onClick} className={className}>
    <FontAwesomeIcon icon={faLock} />
    {label}
    {showLastUsed && <ButtonBadge variant="project">Last used</ButtonBadge>}
  </Button>
);
