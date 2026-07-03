import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LucideIcon } from "lucide-react";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS } from "@app/components/mfa/setup";
import { createNotification } from "@app/components/notifications";
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
import { useDeleteUserTotpConfiguration, useGetUserTotpConfiguration } from "@app/hooks/api/users";
import { useGetWebAuthnCredentials } from "@app/hooks/api/webauthn";

import { MethodSetupDialog } from "./MethodSetupDialog";
import { PasskeyManagerDialog } from "./PasskeyManagerDialog";

type MethodRowProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  badge: React.ReactNode;
  action: React.ReactNode;
};

const MethodRow = ({ icon: Icon, title, description, badge, action }: MethodRowProps) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 text-muted" />
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-foreground">{title}</p>
          {badge}
        </div>
        <p className="text-xs text-muted">{description}</p>
      </div>
    </div>
    <div className="shrink-0">{action}</div>
  </div>
);

export const MfaMethodsCard = () => {
  const queryClient = useQueryClient();
  const { data: totpConfiguration } = useGetUserTotpConfiguration();
  const { data: webAuthnCredentials = [] } = useGetWebAuthnCredentials();
  const { mutateAsync: deleteTotp, isPending: isDeletingTotp } = useDeleteUserTotpConfiguration();

  const [setupMethod, setSetupMethod] = useState<MfaMethod | null>(null);
  const [isPasskeyManagerOpen, setIsPasskeyManagerOpen] = useState(false);
  const [isRemoveTotpOpen, setIsRemoveTotpOpen] = useState(false);

  const isTotpConfigured = Boolean(totpConfiguration?.isVerified);
  const passkeyCount = webAuthnCredentials.length;

  const handleRemoveTotp = async () => {
    try {
      await deleteTotp();
      setIsRemoveTotpOpen(false);
      createNotification({ text: "Authenticator app removed", type: "success" });
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to remove authenticator app",
        type: "error"
      });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-medium text-foreground">Two-factor methods</h3>
      <div className="divide-y divide-border">
        <MethodRow
          icon={MFA_METHOD_ICONS[MfaMethod.EMAIL]}
          title={MFA_METHOD_LABELS[MfaMethod.EMAIL]}
          description="Receive one-time codes at your account email address to complete sign-in."
          badge={<Badge variant="success">Configured</Badge>}
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
      </div>

      <MethodSetupDialog
        method={setupMethod}
        onOpenChange={(isOpen) => !isOpen && setSetupMethod(null)}
        onCompleted={() => queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration })}
      />

      <PasskeyManagerDialog isOpen={isPasskeyManagerOpen} onOpenChange={setIsPasskeyManagerOpen} />

      <AlertDialog open={isRemoveTotpOpen} onOpenChange={setIsRemoveTotpOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove authenticator app?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to set it up again to use it as a second factor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isDeletingTotp}
              onClick={handleRemoveTotp}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
