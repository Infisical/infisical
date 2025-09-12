import { FunctionComponent, ReactNode } from "react";
import { BoundCanProps, Can } from "@casl/react";

import { TooltipProps } from "@app/components/v2/Tooltip/Tooltip";
import { TOrgPermission, useOrgPermission } from "@app/context/OrgPermissionContext";

import { AccessRestrictedBanner, Tooltip } from "../v2";

export const OrgPermissionGuardBanner = () => {
  return (
    <div className="container mx-auto flex h-full items-center justify-center">
      <AccessRestrictedBanner />
    </div>
  );
};

type Props = {
  label?: ReactNode;
  // this prop is used when there exist already a tooltip as helper text for users
  // so when permission is allowed same tooltip will be reused  to show helpertext
  renderTooltip?: boolean;
  allowedLabel?: string;
  renderGuardBanner?: boolean;
  tooltipProps?: Omit<TooltipProps, "children">;
} & BoundCanProps<TOrgPermission>;

export const OrgPermissionCan: FunctionComponent<Props> = ({
  label = "Access restricted",
  children,
  passThrough = true,
  renderTooltip,
  allowedLabel,
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
          typeof children === "function"
            ? children(isAllowed, ability as TOrgPermission)
            : children;

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
          return <OrgPermissionGuardBanner />;
        }

        if (!isAllowed) return null;

        return finalChild;
      }}
    </Can>
  );
};
