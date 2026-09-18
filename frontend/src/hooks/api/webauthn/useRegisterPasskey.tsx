import { useState } from "react";
import { RegistrationResponseJSON, startRegistration } from "@simplewebauthn/browser";

import { createNotification } from "@app/components/notifications";

import { useGenerateRegistrationOptions, useVerifyRegistration } from "./mutations";

const DEFAULT_PASSKEY_NAME = "Passkey";

type VerifyAttestation = (
  registrationResponse: RegistrationResponseJSON,
  name: string
) => Promise<void>;

// Shared passkey registration flow (browser support guard -> options -> prompt ->
// verify) with consistent success/error notifications. Returns true on success so
// callers can chain follow-up work (e.g. advancing a wizard step).
export const useRegisterPasskey = () => {
  const { mutateAsync: generateOptions } = useGenerateRegistrationOptions();
  const { mutateAsync: verifyRegistration } = useVerifyRegistration();
  const [isRegistering, setIsRegistering] = useState(false);

  const registerPasskey = async (name?: string, verify?: VerifyAttestation): Promise<boolean> => {
    if (!window.PublicKeyCredential) {
      createNotification({ text: "WebAuthn is not supported on this browser", type: "error" });
      return false;
    }

    setIsRegistering(true);
    try {
      const options = await generateOptions();
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
