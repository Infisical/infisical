import { FunctionComponent, ReactNode } from "react";
import { BoundCanProps, Can } from "@casl/react";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TOrgPermission, useOrgPermission } from "@app/context/OrgPermissionContext";

import { Tooltip } from "../v2";

export const OrgPermissionGuardBanner = () => {
  return (
    <div className="container mx-auto flex h-full items-center justify-center">
      <div className="flex items-end space-x-12 rounded-md bg-mineshaft-800 p-16 text-bunker-300">
        <div>
          <FontAwesomeIcon icon={faLock} size="6x" />
        </div>
        <div>
          <div className="mb-2 text-4xl font-medium">Access Restricted</div>
          <div className="text-sm">
            Your role has limited permissions, please <br /> contact your admin to gain access
          </div>
        </div>
      </div>
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
} & BoundCanProps<TOrgPermission>;

export const OrgPermissionCan: FunctionComponent<Props> = ({
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
          typeof children === "function"
            ? children(isAllowed, ability as TOrgPermission)
            : children;

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
