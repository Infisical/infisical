import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button } from "@app/components/v2";
import { Badge } from "@app/components/v3";

type Props = {
  label: string;
  onClick: () => void;
  className?: string;
  showLastUsed?: boolean;
};

export const OrgLoginButton = ({ label, onClick, className, showLastUsed }: Props) => (
  <div
    className={twMerge(
      "relative w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6",
      className
    )}
  >
    <Button
      colorSchema="primary"
      variant="outline_bg"
      onClick={onClick}
      leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
      className="mx-0 h-10 w-full"
    >
      {label}
    </Button>
    {showLastUsed && (
      <Badge variant="project" className="absolute -top-2 -right-2 rounded-full">
        Last used
      </Badge>
    )}
  </div>
);
