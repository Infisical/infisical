import { useState } from "react";
import { RegistrationResponseJSON, startRegistration } from "@simplewebauthn/browser";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { getMfaStepUpChallenge, TMfaStepUpChallenge } from "@app/helpers/mfaSession";

import { useVerifyRegistration } from "./mutations";
import { TGenerateRegistrationOptionsResponse } from "./types";

const DEFAULT_PASSKEY_NAME = "Passkey";

type VerifyAttestation = (
  registrationResponse: RegistrationResponseJSON,
  name: string
) => Promise<void>;

type Options = {
  // An account that already has a factor must prove it before adding a passkey.
  onStepUpRequired: (challenge: TMfaStepUpChallenge) => void;
};

// Shared passkey registration flow (browser support guard -> options -> prompt ->
// verify) with consistent success/error notifications. Returns true on success so
// callers can chain follow-up work (e.g. advancing a wizard step).
export const useRegisterPasskey = ({ onStepUpRequired }: Options) => {
  const { mutateAsync: verifyRegistration } = useVerifyRegistration();
  const [isRegistering, setIsRegistering] = useState(false);

  const registerPasskey = async (name?: string, verify?: VerifyAttestation): Promise<boolean> => {
    if (!window.PublicKeyCredential) {
      createNotification({ text: "WebAuthn is not supported on this browser", type: "error" });
      return false;
    }

    setIsRegistering(true);
    try {
      // Called directly rather than through a mutation so the expected step-up 400
      // does not raise the global mutation error toast.
      const { data: options } = await apiRequest.post<TGenerateRegistrationOptionsResponse>(
        "/api/v1/user/me/webauthn/register"
      );
      const registrationResponse = await startRegistration({ optionsJSON: options });
      const resolvedName = name?.trim() || DEFAULT_PASSKEY_NAME;
      if (verify) {
        await verify(registrationResponse, resolvedName);
      } else {
        await verifyRegistration({ registrationResponse, name: resolvedName });
      }
      createNotification({ text: "Passkey registered", type: "success" });
      return true;
    } catch (error: any) {
      const stepUpChallenge = getMfaStepUpChallenge(error);
      if (stepUpChallenge) {
        onStepUpRequired(stepUpChallenge);
        return false;
      }

      let text = "Failed to register passkey";
      if (error.name === "NotAllowedError")
        text = "Passkey registration was cancelled or timed out";
      else if (error.name === "InvalidStateError")
        text = "This passkey has already been registered";
      else if (error?.response?.data?.message) text = error.response.data.message;
      else if (error.message) text = error.message;
      createNotification({ text, type: "error" });
      return false;
    } finally {
      setIsRegistering(false);
    }
  };

  return { registerPasskey, isRegistering };
};
