import { FunctionComponent, ReactNode } from "react";
import { AbilityTuple, MongoAbility } from "@casl/ability";
import { Can } from "@casl/react";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionSet, useProjectPermission } from "@app/context/ProjectPermissionContext";

import { Tooltip } from "../v2/Tooltip";

export const ProjectPermissionGuardBanner = () => {
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

type Props<T extends AbilityTuple> = {
  label?: ReactNode;
  // this prop is used when there exist already a tooltip as helper text for users
  // so when permission is allowed same tooltip will be reused  to show helpertext
  renderTooltip?: boolean;
  allowedLabel?: string;
  children: ReactNode | ((isAllowed: boolean, ability: T) => ReactNode);
  passThrough?: boolean;
  I: T[0];
  a: T[1];
  ability?: MongoAbility<T>;
  renderGuardBanner?: boolean;
};

export const ProjectPermissionCan: FunctionComponent<Props<ProjectPermissionSet>> = ({
  label = "Access restricted",
  children,
  passThrough = true,
  renderTooltip,
  allowedLabel,
  renderGuardBanner,
  ...props
}) => {
  const { permission } = useProjectPermission();
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
          return <ProjectPermissionGuardBanner />;
        }

        if (!isAllowed) return null;

        return finalChild;
      }}
    </Can>
  );
};
