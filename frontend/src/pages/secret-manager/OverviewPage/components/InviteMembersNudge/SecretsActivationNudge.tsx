import { useEffect, useState } from "react";

import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { envConfig } from "@app/config/env";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { InviteMembersModal } from "../InviteMembersModal/InviteMembersModal";
import { InviteMembersNudge } from "./InviteMembersNudge";
import { ActivationVariant, resolveActivationVariant } from "./resolveActivationVariant";

type Props = {
  popUp: UsePopUpState<["inviteMembers"]>;
  handlePopUpToggle: (popUpName: "inviteMembers", state?: boolean) => void;
  isLifted: boolean;
};

export const SecretsActivationNudge = ({ popUp, handlePopUpToggle, isLifted }: Props) => {
  const [variant, setVariant] = useState<ActivationVariant | undefined>();
  const { isOpen } = popUp.inviteMembers;

  useEffect(() => {
    if (!isOpen || variant !== undefined) return undefined;

    const posthog =
      envConfig.ENV === "production" &&
      envConfig.TELEMETRY_CAPTURING_ENABLED === true &&
      envConfig.POSTHOG_API_KEY
        ? new Telemetry().getInstance().api
        : undefined;

    return resolveActivationVariant(posthog, setVariant);
  }, [isOpen, variant]);

  if (variant === undefined) return null;

  if (variant === "card") {
    return (
      <InviteMembersNudge popUp={popUp} handlePopUpToggle={handlePopUpToggle} isLifted={isLifted} />
    );
  }

  return (
    <InviteMembersModal
      popUp={popUp}
      handlePopUpToggle={handlePopUpToggle}
      experimentVariant={variant}
    />
  );
};
