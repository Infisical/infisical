import { ComponentType } from "react";
import { Abilities, AbilityTuple, Generics, SubjectType } from "@casl/ability";
import { twMerge } from "tailwind-merge";

import { AccessRestrictedBanner } from "@app/components/v2";
import {
  TNamespacePermission,
  useNamespacePermission
} from "@app/context/NamespacePermissionContext";

type Props<T extends Abilities> = (T extends AbilityTuple
  ? {
      action: T[0];
      subject: Extract<T[1], SubjectType>;
    }
  : {
      action: string;
      subject: string;
    }) & { containerClassName?: string };

export const withNamespacePermission = <T extends object, J extends TNamespacePermission>(
  Component: ComponentType<T>,
  { action, subject, containerClassName }: Props<Generics<J>["abilities"]>
) => {
  const HOC = (hocProps: T) => {
    const { permission } = useNamespacePermission();

    // akhilmhdh: Set as any due to casl/react ts type bug
    // REASON: casl due to its type checking can't seem to union even if union intersection is applied
    if (permission.cannot(action as any, subject)) {
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

  HOC.displayName = "WithNamespacePermission";
  return HOC;
};
