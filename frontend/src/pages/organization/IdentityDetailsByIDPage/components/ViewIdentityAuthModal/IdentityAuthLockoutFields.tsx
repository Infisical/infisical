import { useState } from "react";
import { UseMutationResult } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";

export const LockoutFields = ({
  clearLockoutsResult,
  lockedOut,
  identityId,
  data
}: {
  clearLockoutsResult: UseMutationResult<number, object, { identityId: string }, unknown>;
  lockedOut: boolean;
  identityId: string;
  data: {
    lockoutEnabled: boolean;
    lockoutThreshold: number;
    lockoutDuration: number;
    lockoutCounterReset: number;
  };
}) => {
  const { mutateAsync, isPending } = clearLockoutsResult;

  const [lockedOutState, setLockedOutState] = useState(lockedOut);

  async function clearLockouts() {
    try {
      const deleted = await mutateAsync({ identityId });
      createNotification({
        text: `Successfully cleared ${deleted} lockout${deleted === 1 ? "" : "s"}`,
        type: "success"
      });
      setLockedOutState(false);
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to clear lockouts. Please try again.",
        type: "error"
      });
    }
  }

  return (
    <>
      <div className="col-span-2 mt-3 flex justify-between border-b border-mineshaft-500 pb-2">
        <span className="text-bunker-300">Lockout Options</span>
        <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed || !lockedOutState || isPending}
              size="xs"
              onClick={() => clearLockouts()}
              isLoading={isPending}
              colorSchema="secondary"
            >
              Clear All Lockouts
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <IdentityAuthFieldDisplay label="Lockout">
        {data.lockoutEnabled ? "Enabled" : "Disabled"}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout Threshold">
        {data.lockoutThreshold}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout Duration">
        {data.lockoutDuration} seconds
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout Counter Reset">
        {data.lockoutCounterReset} seconds
      </IdentityAuthFieldDisplay>
    </>
  );
};
