import { ComponentType } from "react";
import { AbilityTuple } from "@casl/ability";

import {
  AccessRestrictedDialog,
  AccessRestrictedNotice,
  toPermissionRequirement
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";

type Props<T extends AbilityTuple> = {
  containerClassName?: string;
  accessRestrictedMode?: "dialog" | "notice";
  action: T[0];
  subject: T[1];
};

export const withProjectPermission = <T extends object>(
  Component: ComponentType<Omit<Props<ProjectPermissionSet>, "action" | "subject"> & T>,
  {
    action,
    subject,
    containerClassName,
    accessRestrictedMode = "notice"
  }: Props<ProjectPermissionSet>
) => {
  const HOC = (hocProps: Omit<Props<ProjectPermissionSet>, "action" | "subject"> & T) => {
    const { permission } = useProjectPermission();

    // akhilmhdh: Set as any due to casl/react ts type bug
    // REASON: casl due to its type checking can't seem to union even if union intersection is applied
    if (permission.cannot(action as any, subject as any)) {
      const requirement = toPermissionRequirement(action, subject);

      return accessRestrictedMode === "dialog" ? (
        <AccessRestrictedDialog className={containerClassName} requirement={requirement} />
      ) : (
        <AccessRestrictedNotice className={containerClassName} />
      );
    }

    return <Component {...hocProps} />;
  };

  HOC.displayName = "WithProjectPermission";
  return HOC;
};
