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
        "container mx-auto flex h-full items-center justify-center",
        containerClassName
      )}
    >
      <div className={twMerge("rounded-md bg-mineshaft-800 p-16 text-bunker-300", className)}>
        <div className="flex items-end space-x-12">
          <div>
            <FontAwesomeIcon icon={faLock} size="6x" />
          </div>
          <div>
            <div className="mb-2 text-4xl font-medium">Access Restricted</div>
            {children || (
              <div className="text-sm">
                Your role has limited permissions, please <br /> contact your administrator to gain
                access
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
