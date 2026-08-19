import { ComponentType } from "react";
import { Abilities, AbilityTuple, Generics, SubjectType } from "@casl/ability";

import {
  AccessRestrictedDialog,
  AccessRestrictedNotice,
  toPermissionRequirement
} from "@app/components/v3";
import { TOrgPermission, useOrgPermission } from "@app/context";

type Props<T extends Abilities> = (T extends AbilityTuple
  ? {
      action: T[0];
      subject: Extract<T[1], SubjectType>;
    }
  : {
      action: string;
      subject: string;
    }) & { containerClassName?: string; accessRestrictedMode?: "dialog" | "notice" };

export const withPermission = <T extends object, J extends TOrgPermission>(
  Component: ComponentType<T>,
  {
    action,
    subject,
    containerClassName,
    accessRestrictedMode = "notice"
  }: Props<Generics<J>["abilities"]>
) => {
  const HOC = (hocProps: T) => {
    const { permission } = useOrgPermission();

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

  HOC.displayName = "WithPermission";
  return HOC;
};
