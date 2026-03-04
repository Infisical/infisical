import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button } from "@app/components/v2";

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
      <span className="absolute -top-2 -right-2 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
        Last used
      </span>
    )}
  </div>
);
