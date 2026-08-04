import { useState } from "react";
import { CircleAlertIcon, PowerIcon, ShieldCheckIcon } from "lucide-react";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS, RecoveryCodesView } from "@app/components/mfa/setup";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton
} from "@app/components/v3";
import { useGetOrganizations, useGetUser } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { useGetUserTotpConfiguration } from "@app/hooks/api/users";
import { AuthMethod } from "@app/hooks/api/users/types";
import { useGetWebAuthnCredentials } from "@app/hooks/api/webauthn";

import { MfaMethodsCard } from "./MfaMethodsCard";
import { RecoveryOptionsCard } from "./RecoveryOptionsCard";
import { useChangePreferredMfa } from "./useChangePreferredMfa";
import { useDisableMfa } from "./useDisableMfa";
import { useEnableMfa } from "./useEnableMfa";

export const MFASection = () => {
  const { data: user, isPending, isError: isUserError, refetch: refetchUser } = useGetUser();
  const { changePreferredMfa, isBusy: isChangingPreferred } = useChangePreferredMfa();
  const { isBusy: isEnabling, enableMfa } = useEnableMfa();
  const { isBusy: isDisabling, disableMfa } = useDisableMfa();
  const {
    data: totpConfiguration,
    isError: isTotpError,
    refetch: refetchTotp
  } = useGetUserTotpConfiguration();
  const {
    data: webAuthnData,
    isError: isWebAuthnError,
    refetch: refetchWebAuthn
  } = useGetWebAuthnCredentials();
  const webAuthnCredentials = webAuthnData?.credentials ?? [];
  const {
    data: organizations = [],
    isError: isOrganizationsError,
    refetch: refetchOrganizations
  } = useGetOrganizations();
  const {
    data: serverDetails,
    isError: isServerError,
    refetch: refetchServer
  } = useFetchServerStatus();

  const isMfaEnforced = organizations.some((org) => org.enforceMfa);
  const isEmailMfaAvailable = Boolean(serverDetails?.emailConfigured);

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

  if (isUserError || isTotpError || isWebAuthnError || isOrganizationsError || isServerError) {
    return (
      <Alert variant="danger">
        <CircleAlertIcon />
        <AlertTitle>Two-factor authentication settings could not be loaded</AlertTitle>
        <AlertDescription>
          <p>Check your connection and try again.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              Promise.all([
                refetchUser(),
                refetchTotp(),
                refetchWebAuthn(),
                refetchOrganizations(),
                refetchServer()
              ])
            }
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isPending || !user) {
    return (
      <Card aria-label="Loading two-factor authentication settings">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  if (user.authMethods?.includes(AuthMethod.LDAP)) {
    return (
      <Card role="region" aria-labelledby="two-factor-authentication-title">
        <CardHeader>
          <h2
            id="two-factor-authentication-title"
            className="font-alliance text-lg leading-none font-semibold"
          >
            Two-Factor Authentication
          </h2>
          <CardDescription>
            Two-factor authentication is managed by your identity provider for LDAP accounts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const availableMethods = [
    ...(isEmailMfaAvailable ? [MfaMethod.EMAIL] : []),
    ...(totpConfiguration?.isVerified ? [MfaMethod.TOTP] : []),
    ...(webAuthnCredentials.length > 0 ? [MfaMethod.WEBAUTHN] : [])
  ];

  const preferredMethod = user.selectedMfaMethod || MfaMethod.EMAIL;
  const selectedMethod = availableMethods.includes(preferredMethod)
    ? preferredMethod
    : availableMethods[0];

  const canEnable = availableMethods.length > 0;

  const hasRecoveryCodes = user.isMfaEnabled;

  const handleEnable = () => {
    if (!selectedMethod) return;
    setIsEnableOpen(false);
    enableMfa(selectedMethod, (recoveryCodes) => setNewRecoveryCodes(recoveryCodes));
  };

  // Changing the preferred method is sensitive, so it goes through the step-up MFA
  // challenge; the dropdown reflects the new value once getUser is invalidated on
  // success.
  const handlePreferredMethodChange = (method: MfaMethod) => changePreferredMfa(method);

  // Disabling is a sensitive action, so it requires a fresh MFA challenge (same
  // step-up flow as viewing recovery codes) before it goes through.
  const handleDisable = () => disableMfa(() => setIsDisableOpen(false));

  const header = (
    <CardHeader className="p-6">
      <h2
        id="two-factor-authentication-title"
        className="flex flex-wrap items-center gap-1.5 font-alliance text-lg leading-none font-semibold"
      >
        Two-Factor Authentication
        {user.isMfaEnabled ? (
          <Badge variant="success">
            <ShieldCheckIcon /> Enabled
          </Badge>
        ) : (
          <Badge variant="danger">
            <CircleAlertIcon /> Not enabled
          </Badge>
        )}
      </h2>
      <CardDescription>
        {user.isMfaEnabled
          ? "Manage your methods and recovery options."
          : "Two-factor authentication adds an additional layer of security to your account by requiring more than just a password to sign in."}
      </CardDescription>
    </CardHeader>
  );

  const preferredMethodSection = (
    <section className="grid gap-4" aria-labelledby="preferred-2fa-method-title">
      <CardHeader>
        <div className="flex items-center gap-4">
          <h3
            id="preferred-2fa-method-title"
            className="shrink-0 font-alliance text-sm font-semibold"
          >
            Preferred 2FA method
          </h3>
          <Separator className="flex-1" />
        </div>
        <CardDescription>Set the method used first when signing in to Infisical.</CardDescription>
      </CardHeader>
      <div className="max-w-xs">
        <Select
          value={selectedMethod}
          onValueChange={(value) => handlePreferredMethodChange(value as MfaMethod)}
          disabled={isChangingPreferred || availableMethods.length === 0}
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
    </section>
  );

  let footerDescription =
    "Set up an authenticator app or passkey below to enable two-factor authentication. Email codes are unavailable because SMTP is not configured for this instance.";

  if (user.isMfaEnabled) {
    footerDescription = isMfaEnforced
      ? "Your organization requires two-factor authentication, so it can't be disabled."
      : "Turning this off keeps your configured methods, but your recovery codes are invalidated.";
  } else if (canEnable) {
    footerDescription =
      "Choose your preferred method above, then enable two-factor authentication.";
  }

  const footer = (
    <CardFooter className="min-h-8 flex-wrap justify-between gap-8 border-t border-neutral/15 bg-neutral/5 p-4 pl-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">{footerDescription}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {user.isMfaEnabled ? (
          <Button
            variant="danger"
            isDisabled={isMfaEnforced}
            onClick={() => setIsDisableOpen(true)}
          >
            <PowerIcon /> Disable 2FA
          </Button>
        ) : (
          <Button
            variant="neutral"
            isDisabled={isEnabling || !canEnable}
            onClick={() => setIsEnableOpen(true)}
          >
            <ShieldCheckIcon /> Enable two-factor authentication
          </Button>
        )}
      </div>
    </CardFooter>
  );

  return (
    <>
      <Card
        className="gap-0 overflow-hidden p-0"
        role="region"
        aria-labelledby="two-factor-authentication-title"
      >
        {header}
        <CardContent className="flex flex-col gap-6 px-6 pb-6">
          <MfaMethodsCard />
          {hasRecoveryCodes && <RecoveryOptionsCard />}
          {preferredMethodSection}
        </CardContent>
        {footer}
      </Card>

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
            <AlertDialogAction variant="neutral" isPending={isEnabling} onClick={handleEnable}>
              Enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isDisableOpen}
        onOpenChange={(open) => !isDisabling && setIsDisableOpen(open)}
      >
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
            <AlertDialogCancel isDisabled={isDisabling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isDisabling}
              onClick={(event) => {
                event.preventDefault();
                handleDisable();
              }}
            >
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
          <div className="max-h-80 overflow-y-auto">
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
