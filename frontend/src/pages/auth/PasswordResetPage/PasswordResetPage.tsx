import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { UserEncryptionVersion } from "@app/hooks/api/auth/types";

import { ConfirmEmailStep } from "./components/ConfirmEmailStep";
import { EnterPasswordStep } from "./components/EnterPasswordStep";
import { InputBackupKeyStep } from "./components/InputBackupKeyStep";

enum Steps {
  ConfirmEmail = 1,
  InputBackupKey = 2,
  EnterNewPassword = 3
}

const formData = z.object({
  verificationToken: z.string(),
  privateKey: z.string(),
  userEncryptionVersion: z.nativeEnum(UserEncryptionVersion)
});
type TFormData = z.infer<typeof formData>;

export const PasswordResetPage = () => {
  const { watch, setValue } = useForm<TFormData>({
    resolver: zodResolver(formData)
  });

  const verificationToken = watch("verificationToken");
  const encryptionVersion = watch("userEncryptionVersion");
  const privateKey = watch("privateKey");

  const [step, setStep] = useState<Steps>(Steps.ConfirmEmail);
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28">
      <Link to="/">
        <div className="mb-4 mt-20 flex justify-center">
          <img src="/images/gradientLogo.svg" className="h-[90px] w-[120px]" alt="Infisical Logo" />
        </div>
      </Link>
      {step === Steps.ConfirmEmail && (
        <ConfirmEmailStep
          onComplete={(verifyToken, userEncryptionVersion) => {
            setValue("verificationToken", verifyToken);
            setValue("userEncryptionVersion", userEncryptionVersion);

            if (userEncryptionVersion === UserEncryptionVersion.V2) {
              setStep(Steps.EnterNewPassword);
            } else {
              setStep(Steps.InputBackupKey);
            }
          }}
        />
      )}
      {step === Steps.InputBackupKey && (
        <InputBackupKeyStep
          verificationToken={verificationToken}
          onComplete={(key) => {
            setValue("privateKey", key);
            setStep(Steps.EnterNewPassword);
          }}
        />
      )}
      {step === Steps.EnterNewPassword && (
        <EnterPasswordStep
          verificationToken={verificationToken}
          privateKey={privateKey}
          encryptionVersion={encryptionVersion}
          onComplete={() => {
            navigate({ to: "/login" });
          }}
        />
      )}
    </div>
  );
};
