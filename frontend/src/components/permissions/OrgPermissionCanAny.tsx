import { FunctionComponent, ReactNode } from "react";

import { TOrgPermission, useOrgPermission } from "@app/context/OrgPermissionContext";

import { AccessRestrictedBanner, Tooltip } from "../v2";

// Type-safe wrapper to check permissions without strict type constraints
const hasPermission = (ability: TOrgPermission, action: string, subject: string): boolean => {
  return (ability.can as any)(action, subject);
};

type PermissionCheck = {
  action: string;
  subject: string;
};

type Props = {
  label?: ReactNode;
  // this prop is used when there exist already a tooltip as helper text for users
  // so when permission is allowed same tooltip will be reused to show helpertext
  renderTooltip?: boolean;
  allowedLabel?: string;
  renderGuardBanner?: boolean;
  children: ReactNode | ((isAllowed: boolean, ability: TOrgPermission) => ReactNode);
  passThrough?: boolean;
  // Array of permission checks - user needs ANY of these permissions
  permissions: PermissionCheck[];
  // Optional ability override
  ability?: TOrgPermission;
};

export const OrgPermissionCanAny: FunctionComponent<Props> = ({
  label = "Access restricted",
  children,
  passThrough = true,
  renderTooltip,
  allowedLabel,
  renderGuardBanner,
  permissions,
  ability: abilityOverride
}) => {
  const { permission } = useOrgPermission();
  const ability = abilityOverride || permission;

  const isAllowed = permissions.some(({ action, subject }) =>
    hasPermission(ability, action, subject)
  );

  const finalChild = typeof children === "function" ? children(isAllowed, ability) : children;

  if (!isAllowed && passThrough) {
    return <Tooltip content={label}>{finalChild}</Tooltip>;
  }

  if (isAllowed && renderTooltip && allowedLabel) {
    return <Tooltip content={allowedLabel}>{finalChild}</Tooltip>;
  }

  if (!isAllowed && renderGuardBanner) {
    return (
      <div className="container mx-auto flex h-full items-center justify-center">
        <AccessRestrictedBanner />
      </div>
    );
  }

  if (!isAllowed) return null;

  return finalChild;
};
