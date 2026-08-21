import { useState } from "react";
import { LockIcon, TriangleAlertIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api";

import { IdentityAuthMethodSheet } from "./IdentityAuthMethodSheet";

type Props = {
  identityId: string;
  identityName: string;
  authMethods: IdentityAuthMethod[];
  activeLockoutAuthMethods: IdentityAuthMethod[];
  lockoutStateUnavailable?: boolean;
  onMutated: () => void;
};

export const IdentityAuthMethodsCell = ({
  identityId,
  identityName,
  authMethods,
  activeLockoutAuthMethods,
  lockoutStateUnavailable,
  onMutated
}: Props) => {
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<IdentityAuthMethod | null>(null);

  if (!authMethods?.length) {
    return <span className="text-muted">—</span>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {authMethods.map((authMethod) => {
          const isLockedOut = activeLockoutAuthMethods?.includes(authMethod);
          // A lockout state we could not read is not the same as no lockout, so say it is unknown
          // rather than rendering the method as clean.
          const isUnknown = !isLockedOut && Boolean(lockoutStateUnavailable);
          const variant = (() => {
            if (isLockedOut) return "danger";
            if (isUnknown) return "warning";
            return "neutral";
          })();
          const badge = (
            <Badge asChild variant={variant} className="cursor-pointer">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAuthMethod(authMethod);
                }}
              >
                {isLockedOut && <LockIcon />}
                {isUnknown && <TriangleAlertIcon />}
                {identityAuthToNameMap[authMethod]}
              </button>
            </Badge>
          );
          if (!isLockedOut && !isUnknown) {
            return <span key={authMethod}>{badge}</span>;
          }
          return (
            <Tooltip key={authMethod}>
              <TooltipTrigger asChild>{badge}</TooltipTrigger>
              <TooltipContent>
                {isLockedOut
                  ? "Auth method has active lockouts"
                  : "Lockout status is unavailable right now"}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {selectedAuthMethod && (
        <IdentityAuthMethodSheet
          open={selectedAuthMethod !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedAuthMethod(null);
          }}
          identityId={identityId}
          identityName={identityName}
          authMethod={selectedAuthMethod}
          allAuthMethods={authMethods}
          isLockedOut={activeLockoutAuthMethods?.includes(selectedAuthMethod) ?? false}
          onMutated={onMutated}
        />
      )}
    </>
  );
};
