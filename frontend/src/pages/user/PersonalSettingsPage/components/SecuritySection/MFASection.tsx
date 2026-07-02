import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlertIcon,
  FingerprintIcon,
  MailIcon,
  PowerIcon,
  ShieldCheckIcon,
  SmartphoneIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useGetOrganizations, useGetUser, userKeys, useUpdateUserMfa } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useGetUserTotpConfiguration } from "@app/hooks/api/users";
import { AuthMethod } from "@app/hooks/api/users/types";
import { useGetWebAuthnCredentials } from "@app/hooks/api/webauthn";

import { MfaMethodsCard } from "./MfaMethodsCard";
import { MfaSetupWizard } from "./MfaSetupWizard";
import { RecoveryOptionsCard } from "./RecoveryOptionsCard";

const LEARN_MORE_URL = "https://infisical.com/docs/documentation/platform/mfa";

const PREFERRED_METHOD_ICONS: Record<MfaMethod, typeof MailIcon> = {
  [MfaMethod.TOTP]: SmartphoneIcon,
  [MfaMethod.EMAIL]: MailIcon,
  [MfaMethod.WEBAUTHN]: FingerprintIcon
};

const PREFERRED_METHOD_LABELS: Record<MfaMethod, string> = {
  [MfaMethod.TOTP]: "Authenticator app",
  [MfaMethod.EMAIL]: "Email",
  [MfaMethod.WEBAUTHN]: "Passkey"
};

export const MFASection = () => {
  const { data: user, isPending } = useGetUser();
  const { mutateAsync: updateUserMfa, isPending: isUpdating } = useUpdateUserMfa();
  const { data: totpConfiguration } = useGetUserTotpConfiguration();
  const { data: webAuthnCredentials = [] } = useGetWebAuthnCredentials();
  const { data: organizations = [] } = useGetOrganizations();
  const queryClient = useQueryClient();

  const isMfaEnforced = organizations.some((org) => org.enforceMfa);

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isDisableOpen, setIsDisableOpen] = useState(false);

  if (isPending || !user) {
    return <ContentLoader />;
  }

  if (user.authMethods?.includes(AuthMethod.LDAP)) {
    return (
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <h2 className="text-lg font-medium text-mineshaft-100">Two-factor Authentication</h2>
        <p className="mt-1 text-sm text-muted">
          Two-factor authentication is managed by your identity provider for LDAP accounts.
        </p>
      </div>
    );
  }

  const availableMethods = [
    MfaMethod.EMAIL,
    ...(totpConfiguration?.isVerified ? [MfaMethod.TOTP] : []),
    ...(webAuthnCredentials.length > 0 ? [MfaMethod.WEBAUTHN] : [])
  ];
  const selectedMethod = user.selectedMfaMethod || MfaMethod.EMAIL;

  const handlePreferredMethodChange = async (method: MfaMethod) => {
    try {
      await updateUserMfa({ selectedMfaMethod: method });
      createNotification({ text: "Updated preferred 2FA method", type: "success" });
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to update preferred method",
        type: "error"
      });
    }
  };

  const handleDisable = async () => {
    try {
      await updateUserMfa({ isMfaEnabled: false });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userKeys.getUser }),
        queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration }),
        queryClient.invalidateQueries({ queryKey: userKeys.mfaRecoveryCodes })
      ]);
      setIsDisableOpen(false);
      createNotification({ text: "Two-factor authentication disabled", type: "success" });
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to disable two-factor authentication",
        type: "error"
      });
    }
  };

  const disabledView = (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-medium text-mineshaft-100">Two-factor Authentication</h2>
        <Badge variant="danger">
          <CircleAlertIcon /> Not enabled
        </Badge>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Two-factor authentication adds an additional layer of security to your account by requiring
        more than just a password to sign in. Want to learn more about two-factor authentication?{" "}
        <a
          href={LEARN_MORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-mineshaft-200"
        >
          Click here
        </a>
      </p>
      <div className="mt-5">
        <Button variant="org" onClick={() => setIsWizardOpen(true)}>
          <ShieldCheckIcon /> Enable two-factor authentication
        </Button>
      </div>
    </div>
  );

  const enabledView = (
    <div className="mb-6 flex flex-col gap-6">
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-medium text-mineshaft-100">Two-factor Authentication</h2>
          <Badge variant="success">
            <ShieldCheckIcon /> Enabled
          </Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Two-factor authentication is protecting your account. Manage your methods and recovery
          options below.
        </p>

        <div className="mt-6 border-t border-mineshaft-700 pt-6">
          <p className="text-sm font-medium text-mineshaft-100">Preferred 2FA method</p>
          <p className="mb-3 text-sm text-muted">
            Set the method used first when signing in to Infisical.
          </p>
          <div className="max-w-xs">
            <Select
              value={selectedMethod}
              onValueChange={(value) => handlePreferredMethodChange(value as MfaMethod)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a method" />
              </SelectTrigger>
              <SelectContent>
                {availableMethods.map((method) => {
                  const Icon = PREFERRED_METHOD_ICONS[method];
                  return (
                    <SelectItem key={method} value={method}>
                      <span className="flex items-center gap-2">
                        <Icon />
                        {PREFERRED_METHOD_LABELS[method]}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-mineshaft-700 pt-6">
          <p className="text-sm text-muted">
            {isMfaEnforced
              ? "Your organization requires two-factor authentication, so it can't be disabled."
              : "Turning this off removes all configured methods and recovery codes."}
          </p>
          <Button
            variant="danger"
            isDisabled={isMfaEnforced}
            onClick={() => setIsDisableOpen(true)}
          >
            <PowerIcon /> Disable two-factor authentication
          </Button>
        </div>
      </div>

      <MfaMethodsCard />
      <RecoveryOptionsCard />

      <AlertDialog open={isDisableOpen} onOpenChange={setIsDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every configured method (authenticator app, passkeys) and your recovery
              codes. You can re-enable it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" isPending={isUpdating} onClick={handleDisable}>
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <>
      {user.isMfaEnabled ? enabledView : disabledView}
      {/* Mounted at a stable position so enabling MFA mid-wizard (which flips the
          view above) does not unmount the dialog and interrupt the flow. */}
      <MfaSetupWizard isOpen={isWizardOpen} onOpenChange={setIsWizardOpen} />
    </>
  );
};
