import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { z } from "zod";

import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { toast } from "@app/components/v4/ui/sonner";
import { Switch } from "@app/components/v4/ui/switch";
import { Text } from "@app/components/v4/ui/text";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";
import { AuthMethod } from "@app/hooks/api/users/types";

import { CodeForm } from "../../auth/components/CodeForm";
import { PasswordField } from "../../auth/components/PasswordField";
import { PasswordInput } from "../../auth/components/PasswordInput";
import { ProviderMark } from "../../auth/components/ProviderButton";
import { type PersonalUser, usePersonalSettings } from "../../data/personal/contract";
import { orgHref, v4Path } from "../../links";
import { resolveV4Href } from "../../resolveV4Href";
import { TwoFactorCard } from "./TwoFactorCard";

const authMethodOptions = [
  { label: "Email", value: AuthMethod.EMAIL, loginMethod: LoginMethod.EMAIL },
  { label: "Google", value: AuthMethod.GOOGLE, loginMethod: LoginMethod.GOOGLE },
  { label: "GitHub", value: AuthMethod.GITHUB, loginMethod: LoginMethod.GITHUB },
  { label: "GitLab", value: AuthMethod.GITLAB, loginMethod: LoginMethod.GITLAB }
];

const useLoginHref = () => {
  const { v4Mode } = useRouteContext({ from: "/v4/personal-settings" });
  return v4Mode === "demo" ? orgHref("demo", "/projects") : resolveV4Href(v4Path("/login"), v4Mode);
};

const AuthMethods = ({ user }: { user: PersonalUser }) => {
  const personal = usePersonalSettings();
  const { enabledLoginMethods } = personal.useServerConfig();
  const updateAuthMethods = personal.useUpdateAuthMethods();
  const [authMethods, setAuthMethods] = useState(user.authMethods);
  const [pending, setPending] = useState(false);
  const currentAuthMethod = personal.getCurrentAuthMethod();

  useEffect(() => setAuthMethods(user.authMethods), [user.authMethods]);

  const toggle = async (method: (typeof authMethodOptions)[number], enabled: boolean) => {
    setPending(true);
    try {
      const updated = await updateAuthMethods.mutateAsync({
        authMethods: enabled
          ? [...authMethods, method.value]
          : authMethods.filter((entry) => entry !== method.value)
      });
      setAuthMethods(updated.authMethods);
      toast.success(`${method.label} authentication ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error(`Failed to update ${method.label} authentication`);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingsCard
      flush
      title="Authentication methods"
      description="Providers that can sign in to your account with the same email address."
    >
      <List label="Authentication methods">
        {authMethodOptions
          .filter(
            (option) => !enabledLoginMethods || enabledLoginMethods.includes(option.loginMethod)
          )
          .map((option) => {
            const enabled = authMethods.includes(option.value);
            const onlyMethod = enabled && authMethods.length === 1;
            return (
              <ListRow
                key={option.value}
                value={option.value}
                label={option.label}
                title={option.label}
                media={<ProviderMark provider={option.value} />}
                badge={
                  currentAuthMethod === option.value && <Badge tone="soft">Current session</Badge>
                }
                description={
                  onlyMethod ? "Keep at least one authentication method enabled." : undefined
                }
                actions={
                  <Switch
                    aria-label={`Allow sign-in with ${option.label}`}
                    checked={enabled}
                    disabled={pending || onlyMethod}
                    onChange={(checked) => toggle(option, checked)}
                  />
                }
              />
            );
          })}
      </List>
    </SettingsCard>
  );
};

const ChangePassword = ({ user }: { user: PersonalUser }) => {
  const navigate = useNavigate();
  const personal = usePersonalSettings();
  const loginHref = useLoginHref();
  const { passwordPolicy } = personal.useServerConfig();
  const changePassword = personal.useChangePassword();
  const sendSetupEmail = personal.useSendPasswordSetupEmail();
  const [sending, setSending] = useState(false);
  const form = useForm({
    defaultValues: { oldPassword: "", newPassword: "" },
    resolver: zodResolver(
      z.object({
        oldPassword: z.string().min(1, "Current password is required"),
        newPassword: createPasswordSchema(passwordPolicy)
      })
    ),
    mode: "onChange"
  });
  const oldPassword = form.watch("oldPassword");
  const newPassword = form.watch("newPassword");
  const { breachStatus, validatePassword } = usePasswordBreachCheck({
    password: newPassword,
    policy: passwordPolicy
  });
  const { errors, submitCount } = form.formState;

  const save = async () => {
    const valid = await form.trigger();
    if (!valid) throw new Error("Fix the highlighted fields, then try again.");
    if ((await validatePassword(newPassword)) === "breached") {
      form.setError("newPassword", {
        type: "validate",
        message: "This password was found in a known data breach."
      });
      throw new Error("Choose a password that has not appeared in a data breach.");
    }
    if (user.encryptionVersion !== UserEncryptionVersion.V2) {
      throw new Error(
        "Legacy encryption scheme not supported for changing password. Contact support."
      );
    }
    try {
      await changePassword.mutateAsync({ oldPassword, newPassword });
    } catch {
      throw new Error("Failed to change password. Check your current password and try again.");
    }
    toast.success("Password changed");
    form.reset();
    personal.endSession();
    navigate({ href: loginHref });
  };

  const emailSetupLink = async () => {
    setSending(true);
    try {
      await sendSetupEmail.mutateAsync();
      toast.info("Password setup email sent", {
        description: "Check your email to continue setting up a password."
      });
    } catch {
      toast.error("Failed to send password setup email");
    } finally {
      setSending(false);
    }
  };

  return (
    <SettingsCard
      title="Change password"
      description="Changing your password signs this session out."
      action={
        <Button variant="outline" size="xs" loading={sending} onClick={emailSetupLink}>
          Email setup link
        </Button>
      }
      saveLabel="Change password"
      dirty={Boolean(oldPassword || newPassword) && breachStatus !== "checking"}
      onDiscard={() => form.reset()}
      onSave={save}
    >
      <Stack gap={16}>
        <Field label="Current password" error={errors.oldPassword?.message}>
          <PasswordInput
            {...form.register("oldPassword")}
            placeholder=""
            autoComplete="current-password"
            invalid={Boolean(errors.oldPassword)}
          />
        </Field>
        <PasswordField
          label="New password"
          value={newPassword}
          policy={passwordPolicy}
          breachStatus={breachStatus}
          registration={form.register("newPassword")}
          error={errors.newPassword?.message}
          submitCount={submitCount}
        />
      </Stack>
    </SettingsCard>
  );
};

type OtpStep = "currentEmail" | "newEmail";

const emailSchema = z.string().email("Enter a valid email address.");

const ChangeEmail = ({ user }: { user: PersonalUser }) => {
  const navigate = useNavigate();
  const personal = usePersonalSettings();
  const loginHref = useLoginHref();
  const requestChange = personal.useRequestEmailChange();
  const verifyCurrent = personal.useVerifyCurrentEmail();
  const updateEmail = personal.useUpdateEmail();
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [step, setStep] = useState<OtpStep | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasEmailAuth = user.authMethods.includes(AuthMethod.EMAIL);

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  const resetFlow = () => {
    setStep(null);
    setCode("");
    setPendingEmail("");
    setNewEmail("");
  };

  const sendCode = async () => {
    const parsed = emailSchema.safeParse(newEmail.trim());
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    if (parsed.data.toLowerCase() === user.email?.toLowerCase())
      throw new Error("New email must be different from current email.");
    try {
      await requestChange.mutateAsync({ newEmail: parsed.data });
    } catch {
      throw new Error("Failed to send the verification code. Try again.");
    }
    setPendingEmail(parsed.data);
    setCode("");
    setStep("currentEmail");
    toast.success("Verification code sent to your current email address");
  };

  const submitCode = async () => {
    setVerifying(true);
    try {
      if (step === "currentEmail") {
        await verifyCurrent.mutateAsync({ otpCode: code });
        setCode("");
        setStep("newEmail");
        toast.success("Confirmed. Check the inbox of your new email address to continue.");
        return;
      }
      await updateEmail.mutateAsync({ newEmail: pendingEmail, otpCode: code });
      toast.success("Email updated. You will be redirected to login.");
      resetFlow();
      personal.endSession();
      redirectTimer.current = setTimeout(() => navigate({ href: loginHref }), 2000);
    } catch {
      toast.error("Verification failed. Request a new code to try again.");
      resetFlow();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <SettingsCard
        title="Change email"
        description="Verify your current and new email addresses. A successful change signs you out."
        saveLabel="Send verification code"
        dirty={emailSchema.safeParse(newEmail.trim()).success && step === null}
        onDiscard={() => setNewEmail("")}
        onSave={sendCode}
      >
        <Field
          label="New email address"
          description={
            hasEmailAuth
              ? "Email authentication remains enabled after the change."
              : "Email authentication will be enabled automatically. You can change it after signing in with your new email."
          }
        >
          <Input
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </Field>
      </SettingsCard>
      <Dialog open={step !== null} onOpenChange={(open) => !open && !verifying && setStep(null)}>
        <DialogContent pending={verifying}>
          <DialogHeader>
            <DialogTitle>
              {step === "currentEmail" ? "Confirm from current email" : "Confirm from new email"}
            </DialogTitle>
            <DialogDescription>
              Enter the 6-digit code sent to{" "}
              {step === "currentEmail" ? (user.email ?? "your current email") : pendingEmail}.
            </DialogDescription>
          </DialogHeader>
          <CodeForm
            key={step ?? "closed"}
            label="Verification code"
            value={code}
            onChange={setCode}
            onSubmit={submitCode}
            isPending={verifying}
          >
            {step === "newEmail" && (
              <Text muted>
                Didn&apos;t get a code? If the new address already belongs to another Infisical
                account, we&apos;ve sent it an email explaining why the change can&apos;t be
                completed.
              </Text>
            )}
          </CodeForm>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const AuthenticationTab = () => {
  const personal = usePersonalSettings();
  const { data: user, isPending, error, refetch } = personal.useUser();

  if (error)
    return (
      <Alert
        tone="bad"
        title="Authentication settings could not be loaded"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        Check your connection and try again.
      </Alert>
    );

  if (isPending || !user)
    return (
      <Stack gap={24}>
        <SettingsCard title="Two-factor authentication" loading />
        <SettingsCard title="Authentication methods" loading />
      </Stack>
    );

  const isLdap = user.authMethods.includes(AuthMethod.LDAP);

  return (
    <Stack gap={24}>
      {!isLdap && <TwoFactorCard user={user} />}
      {!isLdap && <AuthMethods user={user} />}
      <ChangePassword user={user} />
      {!isLdap && <ChangeEmail user={user} />}
    </Stack>
  );
};
