import { ComponentType } from "react";
import { AbilityTuple } from "@casl/ability";
import { twMerge } from "tailwind-merge";

import { AccessRestrictedBanner } from "@app/components/v2";
import { useProjectPermission } from "@app/context";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";

type Props<T extends AbilityTuple> = {
  containerClassName?: string;
  action: T[0];
  subject: T[1];
};

export const withProjectPermission = <T extends object>(
  Component: ComponentType<Omit<Props<ProjectPermissionSet>, "action" | "subject"> & T>,
  { action, subject, containerClassName }: Props<ProjectPermissionSet>
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
          <AccessRestrictedBanner />
        </div>
      );
    }

    return <Component {...hocProps} />;
  };

  HOC.displayName = "WithProjectPermission";
  return HOC;
};
