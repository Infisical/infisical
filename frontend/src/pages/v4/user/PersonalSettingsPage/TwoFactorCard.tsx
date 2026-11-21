import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { toast } from "@infisical/cipher/ui/sonner";
import { Fingerprint, KeyRound, Mail, Smartphone, Star } from "lucide-react";

import { MFA_METHOD_LABELS } from "@app/components/mfa/setup/types";
import type { TMfaStepUpChallenge } from "@app/helpers/mfaSession";
import { MfaMethod } from "@app/hooks/api/auth/types";

import { EnrollmentStepUp, TotpVerify } from "../../auth/components/MfaMethodSetup";
import { RecoveryCodesPanel } from "../../auth/components/RecoveryCodes";
import { type PersonalUser, usePersonalSettings } from "../../data/personal/contract";

const lucide = (icon: typeof Mail) => <Icon icon={icon} size={16} strokeWidth={1.7} />;

const dateOnly = (value: Date | string) => new Date(value).toLocaleDateString();

type Codes = { recoveryCodes: string[]; acknowledge: boolean };

const RecoveryCodesDialog = ({ codes, onClose }: { codes: Codes | null; onClose: () => void }) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const locked = Boolean(codes?.acknowledge) && !acknowledged;
  const close = () => {
    setAcknowledged(false);
    onClose();
  };
  return (
    <Dialog open={Boolean(codes)} onOpenChange={(open) => !open && !locked && close()}>
      <DialogContent pending={locked} showCloseButton={!locked}>
        <DialogHeader>
          <DialogTitle>
            {codes?.acknowledge ? "Save your recovery codes" : "Recovery codes"}
          </DialogTitle>
          <DialogDescription>
            {codes?.acknowledge
              ? "Store these somewhere safe. Each code works once, and this is the only time they are shown."
              : "Store these somewhere safe. Each code works once."}
          </DialogDescription>
        </DialogHeader>
        <Stack gap={16}>
          <RecoveryCodesPanel recoveryCodes={codes?.recoveryCodes ?? []} />
          {codes?.acknowledge && (
            <Checkbox
              label="I have saved my recovery codes in a safe place"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
            />
          )}
        </Stack>
        {codes?.acknowledge && (
          <DialogFooter>
            <Button
              disabledReason={
                acknowledged ? undefined : "Confirm you saved your recovery codes first"
              }
              onClick={close}
            >
              Done
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

const PasskeysSheet = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const personal = usePersonalSettings();
  const { data, isPending, error, refetch } = personal.useWebAuthnCredentials();
  const credentials = data?.credentials ?? [];
  const [stepUp, setStepUp] = useState<TMfaStepUpChallenge | null>(null);
  const { registerPasskey, isRegistering } = personal.useRegisterPasskey({
    onStepUpRequired: setStepUp
  });
  const removePasskey = personal.useRemovePasskey();
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const hasSecurityKey =
    Boolean(data?.fipsEnabled) &&
    credentials.some(
      (credential) =>
        !credential.transports?.length ||
        !credential.transports.some(
          (transport) => transport === "internal" || transport === "hybrid"
        )
    );

  let list = (
    <List
      label="Passkeys"
      loading={isPending}
      loadingRows={2}
      empty={<EmptyState size="sm" media="bare" icon="lock" title="No passkeys registered yet" />}
    >
      {credentials.map((credential) => (
        <ListRow
          key={credential.id}
          value={credential.id}
          label={credential.name || "Unnamed passkey"}
          title={credential.name || "Unnamed passkey"}
          media={lucide(Fingerprint)}
          description={`Added ${dateOnly(credential.createdAt)}${
            credential.lastUsedAt ? `, last used ${dateOnly(credential.lastUsedAt)}` : ""
          }`}
          actions={
            <Button
              variant="danger-ghost"
              size="xs"
              icon="trash"
              onClick={() =>
                setRemoving({ id: credential.id, name: credential.name || "Unnamed passkey" })
              }
            >
              Remove
            </Button>
          }
        />
      ))}
    </List>
  );
  if (error)
    list = (
      <Alert
        tone="bad"
        title="Passkeys could not be loaded"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    );

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setStepUp(null);
          onOpenChange(next);
        }}
      >
        <SheetContent side="right" size="md">
          <SheetHeader>
            <SheetTitle>Manage passkeys</SheetTitle>
            <SheetDescription>
              Passkeys use Face ID, Touch ID, a security key, or your device to sign in.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <Stack gap={16}>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (await registerPasskey(name)) setName("");
                }}
              >
                <Inline gap={8} align="end" wrap={false}>
                  <Field label="Passkey name" optional className="flex-1">
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                  </Field>
                  <Button
                    type="submit"
                    variant="accent"
                    icon="plus"
                    loading={isRegistering}
                    disabledReason={stepUp ? "Verify your identity first" : undefined}
                  >
                    Add
                  </Button>
                </Inline>
              </form>
              {stepUp && (
                <EnrollmentStepUp
                  challenge={stepUp}
                  onVerified={() => {
                    setStepUp(null);
                    toast.success("Verified. Select Add to register your passkey.");
                  }}
                />
              )}
              {hasSecurityKey && (
                <Alert tone="warn" title="Using a hardware security key?">
                  Previously added security keys (like YubiKey) may use a signing algorithm that
                  fails two-factor authentication on some instances. If signing in with your
                  security key fails, remove it here and add it again.
                </Alert>
              )}
              {list}
            </Stack>
          </SheetBody>
        </SheetContent>
      </Sheet>
      <AlertDialog open={Boolean(removing)} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent tone="danger" pending={removePasskey.isBusy}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer work as a second factor. You can register it again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (removing) removePasskey.run(removing.id, () => setRemoving(null));
              }}
            >
              Remove passkey
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

type Confirm = "enable" | "disable" | "regenerate" | "remove-totp" | null;

export const TwoFactorCard = ({ user }: { user: PersonalUser }) => {
  const personal = usePersonalSettings();
  const totp = personal.useTotpConfiguration();
  const webAuthn = personal.useWebAuthnCredentials();
  const organizations = personal.useOrganizations();
  const server = personal.useServerStatus();
  const enable = personal.useEnableMfa();
  const disable = personal.useDisableMfa();
  const changePreferred = personal.useChangePreferredMfa();
  const recoveryCodes = personal.useRecoveryCodes();
  const removeTotp = personal.useRemoveTotp();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [codes, setCodes] = useState<Codes | null>(null);
  const [settingUpTotp, setSettingUpTotp] = useState(false);
  const [managingPasskeys, setManagingPasskeys] = useState(false);

  const queries = [totp, webAuthn, organizations, server];
  if (queries.some((query) => query.error))
    return (
      <Alert
        tone="bad"
        title="Two-factor authentication settings could not be loaded"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => Promise.all(queries.map((query) => query.refetch()))}
          >
            Retry
          </Button>
        }
      >
        Check your connection and try again.
      </Alert>
    );

  if (queries.some((query) => query.isPending))
    return <SettingsCard title="Two-factor authentication" loading />;

  const isEnforced = (organizations.data ?? []).some((org) => org.enforceMfa);
  const isEmailAvailable = Boolean(server.data?.emailConfigured);
  const isTotpConfigured = Boolean(totp.data?.isVerified);
  const passkeyCount = webAuthn.data?.credentials.length ?? 0;
  const availableMethods = [
    ...(isEmailAvailable ? [MfaMethod.EMAIL] : []),
    ...(isTotpConfigured ? [MfaMethod.TOTP] : []),
    ...(passkeyCount > 0 ? [MfaMethod.WEBAUTHN] : [])
  ];
  const preferred = user.selectedMfaMethod || MfaMethod.EMAIL;
  const selectedMethod = availableMethods.includes(preferred) ? preferred : availableMethods[0];
  const canEnable = availableMethods.length > 0;

  let description =
    "Set up an authenticator app or passkey to enable two-factor authentication. Email codes are unavailable because SMTP is not configured for this instance.";
  if (user.isMfaEnabled)
    description = isEnforced
      ? "Your organization requires two-factor authentication, so it can't be disabled."
      : "Turning this off keeps your methods, but invalidates your recovery codes.";
  else if (canEnable)
    description = "Require a second factor in addition to your password when you sign in.";

  return (
    <>
      <SettingsCard
        flush
        title={
          <Inline gap={8} wrap={false}>
            Two-factor authentication
            {user.isMfaEnabled ? (
              <Badge tone="ok">Enabled</Badge>
            ) : (
              <Badge tone="bad">Not enabled</Badge>
            )}
          </Inline>
        }
        description={description}
        action={
          user.isMfaEnabled ? (
            <Button
              variant="danger-ghost"
              size="xs"
              disabledReason={
                isEnforced ? "Your organization requires two-factor authentication" : undefined
              }
              onClick={() => setConfirm("disable")}
            >
              Disable 2FA
            </Button>
          ) : (
            <Button
              variant="accent"
              size="xs"
              loading={enable.isBusy}
              disabledReason={
                canEnable ? undefined : "Set up an authenticator app or passkey first"
              }
              onClick={() => setConfirm("enable")}
            >
              Enable 2FA
            </Button>
          )
        }
      >
        <List label="Two-factor methods">
          <ListRow
            value="email"
            label="Email"
            title={MFA_METHOD_LABELS[MfaMethod.EMAIL]}
            media={lucide(Mail)}
            badge={
              isEmailAvailable ? (
                <Badge tone="ok">Configured</Badge>
              ) : (
                <Badge tone="soft">Unavailable</Badge>
              )
            }
            description={
              isEmailAvailable
                ? "One-time codes sent to your account email address."
                : "Unavailable because SMTP is not configured for this instance."
            }
          />
          <ListRow
            value="totp"
            label="Authenticator app"
            title={MFA_METHOD_LABELS[MfaMethod.TOTP]}
            media={lucide(Smartphone)}
            badge={
              isTotpConfigured ? (
                <Badge tone="ok">Configured</Badge>
              ) : (
                <Badge tone="soft">None</Badge>
              )
            }
            description="One-time codes from a TOTP authenticator app."
            actions={
              isTotpConfigured ? (
                <Button variant="outline" size="xs" onClick={() => setConfirm("remove-totp")}>
                  Remove
                </Button>
              ) : (
                <Button variant="outline" size="xs" onClick={() => setSettingUpTotp(true)}>
                  Set up
                </Button>
              )
            }
          />
          <ListRow
            value="passkeys"
            label="Passkeys"
            title="Passkeys"
            media={lucide(Fingerprint)}
            badge={
              passkeyCount > 0 ? (
                <Badge tone="ok">{passkeyCount} registered</Badge>
              ) : (
                <Badge tone="soft">None</Badge>
              )
            }
            description="Face ID, Touch ID, a security key, or your device."
            actions={
              <Button variant="outline" size="xs" onClick={() => setManagingPasskeys(true)}>
                Manage
              </Button>
            }
          />
          {user.isMfaEnabled && (
            <ListRow
              value="recovery-codes"
              label="Recovery codes"
              title="Recovery codes"
              media={lucide(KeyRound)}
              description="Sign in if you lose access to your other methods. Each code works once."
              actions={
                <Inline gap={8} wrap={false}>
                  <Button
                    variant="outline"
                    size="xs"
                    icon="eye"
                    disabled={recoveryCodes.isBusy}
                    onClick={() =>
                      recoveryCodes.run("view", (recovery) =>
                        setCodes({ recoveryCodes: recovery, acknowledge: false })
                      )
                    }
                  >
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    icon="sync"
                    disabled={recoveryCodes.isBusy}
                    onClick={() => setConfirm("regenerate")}
                  >
                    Regenerate
                  </Button>
                </Inline>
              }
            />
          )}
          <ListRow
            value="preferred"
            label="Preferred method"
            title="Preferred method"
            media={lucide(Star)}
            description="Used first when you sign in."
            actions={
              <Select
                aria-label="Preferred 2FA method"
                size="sm"
                placeholder="Select a method"
                disabled={changePreferred.isBusy || availableMethods.length === 0}
                options={availableMethods.map((method) => ({
                  value: method,
                  label: MFA_METHOD_LABELS[method]
                }))}
                value={selectedMethod}
                onChange={(method: string) => changePreferred.run(method as MfaMethod)}
              />
            }
          />
        </List>
      </SettingsCard>

      <AlertDialog open={confirm === "enable"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedMethod && MFA_METHOD_LABELS[selectedMethod]} becomes your preferred method.
              You&apos;ll be shown a set of recovery codes to save right after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirm(null);
                if (selectedMethod)
                  enable.run(selectedMethod, (recovery) =>
                    setCodes({ recoveryCodes: recovery, acknowledge: true })
                  );
              }}
            >
              Enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "disable"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent tone="danger" pending={disable.isBusy}>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              You will first verify with MFA. After that, sign-in no longer asks for a second
              factor. Your methods are kept, but your recovery codes are invalidated. Re-enabling
              issues a fresh set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                disable.run(() => setConfirm(null));
              }}
            >
              Disable 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirm === "regenerate"}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate recovery codes?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new set and immediately invalidates all existing codes. You&apos;ll
              verify with MFA first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirm(null);
                recoveryCodes.run("regenerate", (recovery) =>
                  setCodes({ recoveryCodes: recovery, acknowledge: true })
                );
              }}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirm === "remove-totp"}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent tone="danger" pending={removeTotp.isBusy}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove authenticator app?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to set it up again to use it as a second factor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                removeTotp.run(() => setConfirm(null));
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={settingUpTotp} onOpenChange={setSettingUpTotp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up {MFA_METHOD_LABELS[MfaMethod.TOTP].toLowerCase()}</DialogTitle>
          </DialogHeader>
          {settingUpTotp && (
            <TotpVerify api={personal} onVerified={() => setSettingUpTotp(false)} />
          )}
        </DialogContent>
      </Dialog>

      <PasskeysSheet open={managingPasskeys} onOpenChange={setManagingPasskeys} />
      <RecoveryCodesDialog codes={codes} onClose={() => setCodes(null)} />
    </>
  );
};
