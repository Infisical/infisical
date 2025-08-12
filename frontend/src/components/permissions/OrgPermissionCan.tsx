import { FunctionComponent, ReactNode } from "react";
import { AbilityTuple, MongoAbility } from "@casl/ability";
import { Can } from "@casl/react";

import { useOrgPermission } from "@app/context/OrgPermissionContext";
import { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";

import { AccessRestrictedBanner, Tooltip } from "../v2";

export const OrgPermissionGuardBanner = () => {
  return (
    <div className="container mx-auto flex h-full items-center justify-center">
      <AccessRestrictedBanner />
    </div>
  );
};

type Props<T extends AbilityTuple> = {
  label?: ReactNode;
  // this prop is used when there exist already a tooltip as helper text for users
  // so when permission is allowed same tooltip will be reused  to show helpertext
  renderTooltip?: boolean;
  allowedLabel?: string;
  renderGuardBanner?: boolean;
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
  renderGuardBanner,
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
          return <Tooltip content={label}>{finalChild}</Tooltip>;
        }

        if (isAllowed && renderTooltip && allowedLabel) {
          return <Tooltip content={allowedLabel}>{finalChild}</Tooltip>;
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
