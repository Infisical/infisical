import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LucideIcon } from "lucide-react";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS } from "@app/components/mfa/setup";
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
  Button
} from "@app/components/v3";
import { userKeys } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { useGetUserTotpConfiguration } from "@app/hooks/api/users";
import { useGetWebAuthnCredentials } from "@app/hooks/api/webauthn";

import { MethodSetupDialog } from "./MethodSetupDialog";
import { PasskeyManagerDialog } from "./PasskeyManagerDialog";
import { RecoveryOptionsCard } from "./RecoveryOptionsCard";
import { useRemoveTotp } from "./useRemoveTotp";

type MethodRowProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  badge: React.ReactNode;
  action: React.ReactNode;
};

const MethodRow = ({ icon: Icon, title, description, badge, action }: MethodRowProps) => (
  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 py-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]">
    <Icon className="row-span-2 row-start-1 size-6 text-muted" />
    <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-2">
      <p className="text-sm text-foreground">{title}</p>
      {badge}
    </div>
    <p className="col-start-2 row-start-2 text-sm text-muted">{description}</p>
    <div className="col-start-2 row-start-3 justify-self-end sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center">
      {action}
    </div>
  </div>
);

type MfaMethodsCardProps = {
  showRecoveryCodes: boolean;
};

export const MfaMethodsCard = ({ showRecoveryCodes }: MfaMethodsCardProps) => {
  const queryClient = useQueryClient();
  const { data: totpConfiguration } = useGetUserTotpConfiguration();
  const { data: webAuthnData } = useGetWebAuthnCredentials();
  const webAuthnCredentials = webAuthnData?.credentials ?? [];
  const { data: serverDetails } = useFetchServerStatus();
  const { removeTotp, isBusy: isRemovingTotp } = useRemoveTotp();

  const isEmailMfaAvailable = Boolean(serverDetails?.emailConfigured);

  const [setupMethod, setSetupMethod] = useState<MfaMethod | null>(null);
  const [isPasskeyManagerOpen, setIsPasskeyManagerOpen] = useState(false);
  const [isRemoveTotpOpen, setIsRemoveTotpOpen] = useState(false);

  const isTotpConfigured = Boolean(totpConfiguration?.isVerified);
  const passkeyCount = webAuthnCredentials.length;

  // Removing weakens a login second factor, so it goes through the step-up MFA
  // challenge; the dialog stays open until the challenge completes and the removal
  // succeeds.
  const handleRemoveTotp = () => removeTotp(() => setIsRemoveTotpOpen(false));

  return (
    <section aria-label="Two-factor authentication methods">
      <div className="divide-y divide-border">
        <MethodRow
          icon={MFA_METHOD_ICONS[MfaMethod.EMAIL]}
          title={MFA_METHOD_LABELS[MfaMethod.EMAIL]}
          description={
            isEmailMfaAvailable
              ? "Receive one-time codes at your account email address to complete sign-in."
              : "Unavailable because SMTP is not configured for this instance. Use an authenticator app or passkey instead."
          }
          badge={
            isEmailMfaAvailable ? (
              <Badge variant="success">Configured</Badge>
            ) : (
              <Badge variant="neutral">Unavailable</Badge>
            )
          }
          action={null}
        />

        <MethodRow
          icon={MFA_METHOD_ICONS[MfaMethod.TOTP]}
          title={MFA_METHOD_LABELS[MfaMethod.TOTP]}
          description="Use a TOTP authenticator app to get one-time codes when prompted at sign-in."
          badge={
            isTotpConfigured ? (
              <Badge variant="success">Configured</Badge>
            ) : (
              <Badge variant="neutral">None</Badge>
            )
          }
          action={
            isTotpConfigured ? (
              <Button variant="outline" size="sm" onClick={() => setIsRemoveTotpOpen(true)}>
                Remove
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSetupMethod(MfaMethod.TOTP)}>
                Set up
              </Button>
            )
          }
        />

        <MethodRow
          icon={MFA_METHOD_ICONS[MfaMethod.WEBAUTHN]}
          title="Passkeys"
          description="Passkeys use Face ID, Touch ID, a security key, or your device to sign in."
          badge={
            passkeyCount > 0 ? (
              <Badge variant="success">{`${passkeyCount} registered`}</Badge>
            ) : (
              <Badge variant="neutral">None</Badge>
            )
          }
          action={
            <Button variant="outline" size="sm" onClick={() => setIsPasskeyManagerOpen(true)}>
              Manage
            </Button>
          }
        />
        {showRecoveryCodes && <RecoveryOptionsCard />}
      </div>

      <MethodSetupDialog
        method={setupMethod}
        onOpenChange={(isOpen) => !isOpen && setSetupMethod(null)}
        onCompleted={() => queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration })}
      />

      <PasskeyManagerDialog isOpen={isPasskeyManagerOpen} onOpenChange={setIsPasskeyManagerOpen} />

      <AlertDialog
        open={isRemoveTotpOpen}
        onOpenChange={(open) => !isRemovingTotp && setIsRemoveTotpOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove authenticator app?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to set it up again to use it as a second factor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRemovingTotp}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isRemovingTotp}
              onClick={(event) => {
                event.preventDefault();
                handleRemoveTotp();
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
