import { ReactNode } from "react";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

type Props = {
  containerClassName?: string;
  className?: string;
  children?: ReactNode;
};

export const PermissionDeniedBanner = ({ containerClassName, className, children }: Props) => {
  return (
    <div
      className={twMerge(
        "container h-full mx-auto flex justify-center items-center",
        containerClassName
      )}
    >
      <div
        className={twMerge(
          "rounded-md bg-mineshaft-800 text-bunker-300 p-16 flex space-x-12 items-end",
          className
        )}
      >
        <div>
          <FontAwesomeIcon icon={faLock} size="6x" />
        </div>
        <div>
          <div className="text-4xl font-medium mb-2">Access Restricted</div>
          {children || (
            <div className="text-sm">
              Your role has limited permissions, please <br/> contact your administrator to gain access
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
