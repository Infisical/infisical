import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useUser
} from "@app/context";
import { fetchSecretsActivationStatus, userActivationKeys } from "@app/hooks/api";

import { usePopUp } from "./usePopUp";

// Small delay before opening the modal so it doesn't pop the instant a secret is created, which
// reads as abrupt. Tunable.
const ACTIVATION_NUDGE_DELAY_MS = 1500;

// Growth nudge for the secret overview page. `checkActivation` is called when the user creates a
// secret, but it runs the request at most once per session: the result is cached (gcTime Infinity)
// and we skip entirely once it is present, so the modal never re-opens on remount. The check is
// also gated on the user being able to invite members and being recent, opens the modal only if
// the backend says so, and is a no-op if the request fails.
export const useSecretsActivationNudge = () => {
  const { user } = useUser();
  const { currentOrg, isRootOrganization } = useOrganization();
  const { permission } = useOrgPermission();
  const queryClient = useQueryClient();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["inviteMembers"] as const);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cancel a pending open if the consumer unmounts before the delay elapses.
  useEffect(
    () => () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
    },
    []
  );

  const canInviteMembers = permission.can(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Member
  );

  const checkActivation = useCallback(
    async (customDelayMs?: number) => {
      if (!isRootOrganization || !canInviteMembers || !currentOrg?.id) return;

      const queryKey = userActivationKeys.secretsStatus(currentOrg.id, user.id);
      console.log("queryKey", queryKey);
      // Already checked this session (cached): don't call again and don't re-open the modal.
      if (queryClient.getQueryData(queryKey) !== undefined) return;

      try {
        const data = await queryClient.ensureQueryData({
          queryKey,
          queryFn: fetchSecretsActivationStatus,
          retry: false,
          gcTime: Infinity
        });
        if (data.shouldShowActivation) {
          // Give the page a beat before nudging so it doesn't feel abrupt.
          if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
          openTimeoutRef.current = setTimeout(() => {
            handlePopUpOpen("inviteMembers");
          }, customDelayMs ?? ACTIVATION_NUDGE_DELAY_MS);
        }
      } catch {
        // Silent by design: a failed activation check must not disrupt the page.
      }
    },
    [isRootOrganization, canInviteMembers, currentOrg?.id, user.id, queryClient, handlePopUpOpen]
  );

  return { popUp, handlePopUpToggle, checkActivation };
};
