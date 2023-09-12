import { ComponentType } from "react";
import { Abilities, AbilityTuple, Generics, SubjectType } from "@casl/ability";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { TProjectPermission, useProjectPermission } from "@app/context";

type Props<T extends Abilities> = (T extends AbilityTuple
  ? {
      action: T[0];
      subject: Extract<T[1], SubjectType>;
    }
  : {
      action: string;
      subject: string;
    }) & { className?: string; containerClassName?: string };

export const withProjectPermission = <T extends {}, J extends TProjectPermission>(
  Component: ComponentType<T>,
  { action, subject, className, containerClassName }: Props<Generics<J>["abilities"]>
) => {
  const HOC = (hocProps: T) => {
    const permission = useProjectPermission();

    // akhilmhdh: Set as any due to casl/react ts type bug
    // REASON: casl due to its type checking can't seem to union even if union intersection is applied
    if (permission.cannot(action as any, subject)) {
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
              <div className="text-4xl font-medium mb-2">Permission Denied</div>
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
