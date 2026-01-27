import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ConfirmActionModal } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { usePopUp } from "@app/hooks";
import { useEnableEmailAuthAccountRecovery } from "@app/hooks/api";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";

import { ConfirmEmailStep } from "./components/ConfirmEmailStep";
import { EnterPasswordStep } from "./components/EnterPasswordStep";
import { InputBackupKeyStep } from "./components/InputBackupKeyStep";
import { RecoveryMethod, SelectRecoveryMethodStep } from "./components/SelectRecoveryMethodStep";

enum Steps {
  ConfirmEmail = 1,
  SelectRecoveryMethod = 2,
  InputBackupKey = 3,
  EnterNewPassword = 4
}

export const AccountRecoveryResetPage = () => {
  const search = useSearch({ from: ROUTE_PATHS.Auth.AccountRecoveryResetPage.id });
  const { to: email } = search;
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "confirmEnableEmailAuth"
  ] as const);

  const [userDetails, setUserDetails] = useState({
    verificationToken: "",
    privateKey: "",
    hasEmailAuthEnabled: false,
    userEncryptionVersion: UserEncryptionVersion.V1
  });

  const [step, setStep] = useState<Steps>(Steps.ConfirmEmail);
  const navigate = useNavigate();
  const enableEmailAuth = useEnableEmailAuthAccountRecovery();

  const handleRecoveryMethodSelect = (method: RecoveryMethod) => {
    if (method === RecoveryMethod.ChangePassword) {
      if (userDetails.userEncryptionVersion === UserEncryptionVersion.V2) {
        setStep(Steps.EnterNewPassword);
      } else {
        setStep(Steps.InputBackupKey);
      }
    } else if (method === RecoveryMethod.DomainOrSSOChange) {
      handlePopUpOpen("confirmEnableEmailAuth");
    }
  };

  const handleEnableEmailAuth = async () => {
    await enableEmailAuth.mutateAsync(userDetails.verificationToken);
    setUserDetails((prev) => ({ ...prev, hasEmailAuthEnabled: true }));
    handlePopUpToggle("confirmEnableEmailAuth", false);
    createNotification({
      type: "success",
      text: "Email authentication has been enabled for your account."
    });
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28">
      <Link to="/">
        <div className="mt-20 mb-4 flex justify-center">
          <img src="/images/gradientLogo.svg" className="h-[90px] w-[120px]" alt="Infisical Logo" />
        </div>
      </Link>
      {step === Steps.ConfirmEmail && (
        <ConfirmEmailStep
          onComplete={(verifyToken, userEncryptionVersion, hasEmailAuth) => {
            setUserDetails((prev) => ({
              ...prev,
              verificationToken: verifyToken,
              userEncryptionVersion,
              hasEmailAuthEnabled: hasEmailAuth
            }));
            setStep(Steps.SelectRecoveryMethod);
          }}
        />
      )}
      {step === Steps.SelectRecoveryMethod && (
        <SelectRecoveryMethodStep
          email={email}
          onSelect={handleRecoveryMethodSelect}
          hasEmailAuthEnabled={userDetails.hasEmailAuthEnabled}
        />
      )}
      {step === Steps.InputBackupKey && (
        <InputBackupKeyStep
          verificationToken={userDetails.verificationToken}
          onComplete={(key) => {
            setUserDetails((prev) => ({ ...prev, privateKey: key }));
            setStep(Steps.EnterNewPassword);
          }}
        />
      )}
      {step === Steps.EnterNewPassword && (
        <EnterPasswordStep
          verificationToken={userDetails.verificationToken}
          privateKey={userDetails.privateKey}
          encryptionVersion={userDetails.userEncryptionVersion}
          onComplete={() => {
            navigate({ to: "/login" });
          }}
          onBack={() => setStep(Steps.SelectRecoveryMethod)}
        />
      )}
      <ConfirmActionModal
        isOpen={popUp.confirmEnableEmailAuth.isOpen}
        confirmKey="enable"
        title="Enable Email Authentication"
        subTitle={`Do you want to enable email authentication for your account (${email})? This will allow you to log in using your email and password in the future.`}
        onChange={(isOpen) => handlePopUpToggle("confirmEnableEmailAuth", isOpen)}
        onConfirmed={handleEnableEmailAuth}
        buttonText="Enable"
      />
    </div>
  );
};
