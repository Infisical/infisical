import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, Button } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type Props = {
  label: string;
  onClick: () => void;
  className?: string;
  showLastUsed?: boolean;
};

export const OrgLoginButton = ({ label, onClick, className, showLastUsed }: Props) => (
  <div className={cn("relative w-full", className)}>
    <Button variant="outline" size="lg" isFullWidth onClick={onClick}>
      <FontAwesomeIcon icon={faLock} className="mr-2" />
      {label}
    </Button>
    {showLastUsed && (
      <Badge variant="project" className="absolute -top-2 -right-2">
        Last used
      </Badge>
    )}
  </div>
);
