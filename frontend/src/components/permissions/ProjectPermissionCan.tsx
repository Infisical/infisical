import { FunctionComponent, ReactNode } from "react";
import { AbilityTuple, MongoAbility } from "@casl/ability";
import { Can } from "@casl/react";

import {
  AccessRestrictedDialog,
  AccessRestrictedNotice,
  TAccessRestrictedRequirement,
  toPermissionRequirement
} from "@app/components/v3";
import { ProjectPermissionSet, useProjectPermission } from "@app/context/ProjectPermissionContext";

import { Tooltip } from "../v2/Tooltip";

export const ProjectPermissionGuardBanner = ({
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
  children: ReactNode | ((isAllowed: boolean, ability: T) => ReactNode);
  accessRestrictedMode?: "dialog" | "notice";
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
  accessRestrictedMode = "dialog",
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

        if (!isAllowed && renderGuardBanner) {
          return (
            <ProjectPermissionGuardBanner
              accessRestrictedMode={accessRestrictedMode}
              requirement={toPermissionRequirement(props.I, props.a)}
            />
          );
        }

        if (!isAllowed && passThrough) {
          return <Tooltip content={label}>{finalChild}</Tooltip>;
        }

        if (isAllowed && renderTooltip && allowedLabel) {
          return <Tooltip content={allowedLabel}>{finalChild}</Tooltip>;
        }

        if (!isAllowed) return null;

        return finalChild;
      }}
    </Can>
  );
};
