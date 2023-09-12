import { FunctionComponent, ReactNode } from "react";
import { BoundCanProps, Can } from "@casl/react";

import { TProjectPermission, useProjectPermission } from "@app/context/ProjectPermissionContext";

import { Tooltip } from "../v2";

type Props = {
  label?: ReactNode;
  // this prop is used when there exist already a tooltip as helper text for users
  // so when permission is allowed same tooltip will be reused  to show helpertext
  renderTooltip?: boolean;
  allowedLabel?: string;
  // BUG(akhilmhdh): As a workaround for now i put any but this should be TProjectPermission
  // For some reason when i put TProjectPermission in a wrapper component it just wont work causes a weird  ts error
  // tried a lot combinations
  // REF: https://github.com/stalniy/casl/blob/ac081a34f56366a7eaaed05d21689d27041ef005/packages/casl-react/src/factory.ts#L15
} & BoundCanProps<any>;

export const ProjectPermissionCan: FunctionComponent<Props> = ({
  label = "Access restricted",
  children,
  passThrough = true,
  renderTooltip,
  allowedLabel,
  ...props
}) => {
  const permission = useProjectPermission();
  return (
    <Can {...props} passThrough={passThrough} ability={props?.ability || permission}>
      {(isAllowed, ability) => {
        // akhilmhdh: This is set as type due to error in casl react type.
        const finalChild =
          typeof children === "function"
            ? children(isAllowed, ability as TProjectPermission)
            : children;

        if (!isAllowed && passThrough) {
          return <Tooltip content={label}>{finalChild}</Tooltip>;
        }

        if (isAllowed && renderTooltip) {
          return <Tooltip content={allowedLabel}>{finalChild}</Tooltip>;
        }

        if (!isAllowed) return null;

        return finalChild;
      }}
    </Can>
  );
};
