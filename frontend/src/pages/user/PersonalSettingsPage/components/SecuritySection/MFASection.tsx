import { useState } from "react";
import { CircleAlertIcon, PowerIcon, ShieldCheckIcon } from "lucide-react";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS, RecoveryCodesView } from "@app/components/mfa/setup";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useActivateMfa, useGetOrganizations, useGetUser, useSetMfaMethod } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useGetUserTotpConfiguration } from "@app/hooks/api/users";
import { AuthMethod } from "@app/hooks/api/users/types";
import { useGetWebAuthnCredentials } from "@app/hooks/api/webauthn";

import { MfaMethodsCard } from "./MfaMethodsCard";
import { RecoveryOptionsCard } from "./RecoveryOptionsCard";
import { useDisableMfa } from "./useDisableMfa";

const LEARN_MORE_URL = "https://infisical.com/docs/documentation/platform/mfa";

export const MFASection = () => {
  const { data: user, isPending } = useGetUser();
  const { mutateAsync: setMfaMethod } = useSetMfaMethod();
  const { mutateAsync: activateMfa, isPending: isEnabling } = useActivateMfa();
  const { isBusy: isDisabling, disableMfa } = useDisableMfa();
  const { data: totpConfiguration } = useGetUserTotpConfiguration();
  const { data: webAuthnCredentials = [] } = useGetWebAuthnCredentials();
  const { data: organizations = [] } = useGetOrganizations();

  const isMfaEnforced = organizations.some((org) => org.enforceMfa);

  const [isEnableOpen, setIsEnableOpen] = useState(false);
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  // Holds the fresh recovery codes returned on enable so they can be shown once.
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  // Gate closing the "save your codes" dialog until the user acknowledges they
  // saved them, since this is the only time the freshly minted codes are shown.
  const [hasAcknowledgedCodes, setHasAcknowledgedCodes] = useState(false);

  const closeRecoveryCodesDialog = () => {
    setNewRecoveryCodes(null);
    setHasAcknowledgedCodes(false);
  };

  if (isPending || !user) {
    return <ContentLoader />;
  }

  if (user.authMethods?.includes(AuthMethod.LDAP)) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-medium text-foreground">Two-factor Authentication</h2>
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

  const preferredMethod = user.selectedMfaMethod || MfaMethod.EMAIL;
  const selectedMethod = availableMethods.includes(preferredMethod)
    ? preferredMethod
    : availableMethods[0];

  // Recovery codes are issued on enable and wiped on disable, so they exist iff
  // MFA is currently enabled.
  const hasRecoveryCodes = user.isMfaEnabled;

  const handleEnable = async () => {
    try {
      const { recoveryCodes } = await activateMfa({ selectedMfaMethod: selectedMethod });
      setIsEnableOpen(false);
      setNewRecoveryCodes(recoveryCodes);
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to enable two-factor authentication",
        type: "error"
      });
    }
  };

  const handlePreferredMethodChange = async (method: MfaMethod) => {
    try {
      await setMfaMethod({ selectedMfaMethod: method });
      createNotification({ text: "Updated preferred 2FA method", type: "success" });
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to update preferred method",
        type: "error"
      });
    }
  };

  // Disabling is a sensitive action, so it requires a fresh MFA challenge (same
  // step-up flow as viewing recovery codes) before it goes through.
  const handleDisable = () => disableMfa(() => setIsDisableOpen(false));

  const banner = (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-medium text-foreground">Two-factor Authentication</h2>
        {user.isMfaEnabled ? (
          <Badge variant="success">
            <ShieldCheckIcon /> Enabled
          </Badge>
        ) : (
          <Badge variant="danger">
            <CircleAlertIcon /> Not enabled
          </Badge>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        {user.isMfaEnabled ? (
          "Two-factor authentication is protecting your account. Manage your methods and recovery options below."
        ) : (
          <>
            Two-factor authentication adds an additional layer of security to your account by
            requiring more than just a password to sign in. Want to learn more about two-factor
            authentication?{" "}
            <a
              href={LEARN_MORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Click here
            </a>
          </>
        )}
      </p>

      <div className="mt-6 border-t border-border pt-6">
        <p className="text-sm font-medium text-foreground">Preferred 2FA method</p>
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
                const Icon = MFA_METHOD_ICONS[method];
                return (
                  <SelectItem key={method} value={method}>
                    <span className="flex items-center gap-2">
                      <Icon />
                      {MFA_METHOD_LABELS[method]}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-6">
        {user.isMfaEnabled ? (
          <>
            <p className="text-sm text-muted">
              {isMfaEnforced
                ? "Your organization requires two-factor authentication, so it can't be disabled."
                : "Turning this off keeps your configured methods, but your recovery codes are invalidated and a new set is issued when you re-enable."}
            </p>
            <Button
              variant="danger"
              isDisabled={isMfaEnforced}
              onClick={() => setIsDisableOpen(true)}
            >
              <PowerIcon /> Disable two-factor authentication
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Choose your preferred method above, then enable two-factor authentication.
            </p>
            <Button variant="org" isDisabled={isEnabling} onClick={() => setIsEnableOpen(true)}>
              <ShieldCheckIcon /> Enable two-factor authentication
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="mb-6 flex flex-col gap-6">
        {banner}
        <MfaMethodsCard />
        {hasRecoveryCodes && <RecoveryOptionsCard />}
      </div>

      <AlertDialog open={isEnableOpen} onOpenChange={setIsEnableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              This turns on two-factor authentication using {MFA_METHOD_LABELS[selectedMethod]} as
              your preferred method. You&apos;ll be shown a set of recovery codes to save right
              after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="org" isPending={isEnabling} onClick={handleEnable}>
              Enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDisableOpen} onOpenChange={setIsDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              You will first be asked to verify with MFA. After that, you will no longer be prompted
              for a second factor when signing in. Your configured methods are kept, but your
              current recovery codes are invalidated. Re-enabling issues a fresh set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" isPending={isDisabling} onClick={handleDisable}>
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={newRecoveryCodes !== null}
        onOpenChange={(open) => {
          if (!open && hasAcknowledgedCodes) closeRecoveryCodesDialog();
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={hasAcknowledgedCodes}
          onInteractOutside={(e) => !hasAcknowledgedCodes && e.preventDefault()}
          onEscapeKeyDown={(e) => !hasAcknowledgedCodes && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Save your recovery codes</DialogTitle>
            <DialogDescription>
              Store these somewhere safe. Each code can only be used once, and this is the only time
              they are shown.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto">
            <RecoveryCodesView
              recoveryCodes={newRecoveryCodes ?? []}
              acknowledgment={{
                isAcknowledged: hasAcknowledgedCodes,
                onAcknowledgedChange: setHasAcknowledgedCodes,
                confirmLabel: "Done",
                onConfirm: closeRecoveryCodesDialog
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
