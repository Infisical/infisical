import { FunctionComponent, ReactNode } from "react";
import { AbilityTuple, MongoAbility } from "@casl/ability";
import { Can } from "@casl/react";

import { TooltipProps } from "@app/components/v2/Tooltip/Tooltip";
import {
  AccessRestrictedDialog,
  AccessRestrictedNotice,
  TAccessRestrictedRequirement,
  toPermissionRequirement
} from "@app/components/v3";
import { useOrgPermission } from "@app/context/OrgPermissionContext";
import { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";

import { Tooltip } from "../v2";

export const OrgPermissionGuardBanner = ({
  requirement,
  accessRestrictedMode = "notice"
}: {
  requirement?: TAccessRestrictedRequirement;
  accessRestrictedMode?: "dialog" | "notice";
}) => {
  return accessRestrictedMode === "dialog" ? (
    <AccessRestrictedDialog requirement={requirement} />
  ) : (
    <AccessRestrictedNotice />
  );
};

type Props<T extends AbilityTuple> = {
  label?: ReactNode;
  // this prop is used when there exist already a tooltip as helper text for users
  // so when permission is allowed same tooltip will be reused  to show helpertext
  renderTooltip?: boolean;
  allowedLabel?: string;
  accessRestrictedMode?: "dialog" | "notice";
  renderGuardBanner?: boolean;
  tooltipProps?: Omit<TooltipProps, "children">;
  I: T[0];
  ability?: MongoAbility<T>;
  children: ReactNode | ((isAllowed: boolean, ability: T) => ReactNode);
  passThrough?: boolean;
} & (
  | { an: T[1] }
  | {
      a: T[1];
    }
);

export const OrgPermissionCan: FunctionComponent<Props<OrgPermissionSet>> = ({
  label = "Access restricted",
  children,
  passThrough = true,
  renderTooltip,
  allowedLabel,
  accessRestrictedMode = "dialog",
  renderGuardBanner,
  tooltipProps,
  ...props
}) => {
  const { permission } = useOrgPermission();

  return (
    <Can {...props} passThrough={passThrough} ability={props?.ability || permission}>
      {(isAllowed, ability) => {
        // akhilmhdh: This is set as type due to error in casl react type.
        const finalChild =
          typeof children === "function" ? children(isAllowed, ability as any) : children;

        if (!isAllowed && passThrough) {
          return (
            <Tooltip content={label} {...tooltipProps}>
              {finalChild}
            </Tooltip>
          );
        }

        if (isAllowed && renderTooltip && allowedLabel) {
          return (
            <Tooltip content={allowedLabel} {...tooltipProps}>
              {finalChild}
            </Tooltip>
          );
        }

        if (!isAllowed && renderGuardBanner) {
          return (
            <OrgPermissionGuardBanner
              accessRestrictedMode={accessRestrictedMode}
              requirement={toPermissionRequirement(props.I, "a" in props ? props.a : props.an)}
            />
          );
        }

        if (!isAllowed) return null;

        return finalChild;
      }}
    </Can>
  );
};
