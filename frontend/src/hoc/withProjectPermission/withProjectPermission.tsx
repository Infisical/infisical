import { ComponentType } from "react";
import { AbilityTuple } from "@casl/ability";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { useProjectPermission } from "@app/context";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";

type Props<T extends AbilityTuple> = {
  className?: string;
  containerClassName?: string;
  action: T[0];
  subject: T[1];
};

export const withProjectPermission = <T extends object>(
  Component: ComponentType<Omit<Props<ProjectPermissionSet>, "action" | "subject"> & T>,
  { action, subject, className, containerClassName }: Props<ProjectPermissionSet>
) => {
  const HOC = (hocProps: Omit<Props<ProjectPermissionSet>, "action" | "subject"> & T) => {
    const { permission } = useProjectPermission();

    // akhilmhdh: Set as any due to casl/react ts type bug
    // REASON: casl due to its type checking can't seem to union even if union intersection is applied
    if (permission.cannot(action as any, subject as any)) {
      return (
        <div
          className={twMerge(
            "container mx-auto flex h-full items-center justify-center",
            containerClassName
          )}
        >
          <div
            className={twMerge(
              "flex items-end space-x-12 rounded-md bg-mineshaft-800 p-16 text-bunker-300",
              className
            )}
          >
            <div>
              <FontAwesomeIcon icon={faLock} size="6x" />
            </div>
            <div>
              <div className="mb-2 text-4xl font-medium">Permission Denied</div>
              <div className="text-sm">
                You do not have permission to this page. <br /> Kindly contact your organization
                administrator
              </div>
            </div>
          </div>
        </div>
      );
    }

    return <Component {...hocProps} />;
  };

  HOC.displayName = "WithProjectPermission";
  return HOC;
};
