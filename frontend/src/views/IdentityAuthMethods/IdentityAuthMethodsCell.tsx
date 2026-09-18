import { useState } from "react";
import { LockIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api";

import { IdentityAuthMethodSheet } from "./IdentityAuthMethodSheet";

type Props = {
  identityId: string;
  identityName: string;
  authMethods: IdentityAuthMethod[];
  activeLockoutAuthMethods: IdentityAuthMethod[];
  onMutated: () => void;
};

export const IdentityAuthMethodsCell = ({
  identityId,
  identityName,
  authMethods,
  activeLockoutAuthMethods,
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
          const badge = (
            <Badge asChild variant={isLockedOut ? "danger" : "neutral"} className="cursor-pointer">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAuthMethod(authMethod);
                }}
              >
                {isLockedOut && <LockIcon />}
                {identityAuthToNameMap[authMethod]}
              </button>
            </Badge>
          );
          return isLockedOut ? (
            <Tooltip key={authMethod}>
              <TooltipTrigger asChild>{badge}</TooltipTrigger>
              <TooltipContent>Auth method has active lockouts</TooltipContent>
            </Tooltip>
          ) : (
            <span key={authMethod}>{badge}</span>
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
