import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, ButtonBadge } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type Props = {
  label: string;
  onClick: () => void;
  className?: string;
  showLabel?: boolean;
  showLastUsed?: boolean;
};

export const OrgLoginButton = ({
  label,
  onClick,
  className,
  showLabel = true,
  showLastUsed
}: Props) => (
  <div className={cn("min-w-0 flex-1", className)}>
    <Button variant="outline" size="lg" isFullWidth onClick={onClick}>
      {showLabel && <FontAwesomeIcon icon={faLock} />}
      {showLabel ? `Continue with ${label}` : label}
      {showLastUsed && <ButtonBadge variant="project">Last used</ButtonBadge>}
    </Button>
  </div>
);
