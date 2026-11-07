import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { toast } from "@app/components/v4/ui/sonner";
import { Text } from "@app/components/v4/ui/text";
import { useServerConfig } from "@app/context";
import {
  useEnableEmailAuthAccountRecovery,
  useResetPasswordV2,
  useVerifyAccountRecoveryEmail
} from "@app/hooks/api";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";
import { AuthMethod } from "@app/hooks/api/users/types";

import { AuthPage } from "../components/AuthPage";
import { NewPasswordFields } from "../components/NewPasswordFields";
import { useAuthPreview } from "../preview";

import styles from "../auth.module.css";

enum Steps {
  ConfirmEmail = 1,
  SelectRecoveryMethod = 2,
  InputBackupKey = 3,
  EnterNewPassword = 4
}

enum RecoveryMethod {
  ChangePassword = "change-password",
  DomainOrSSOChange = "domain-or-sso-change"
}

const PREVIEW_STEPS: Record<string, Steps> = {
  confirm: Steps.ConfirmEmail,
  method: Steps.SelectRecoveryMethod,
  password: Steps.EnterNewPassword
};

const createSchema = (passwordPolicy: TPasswordPolicy) =>
  z
    .object({
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "Please confirm your password")
    })
    .refine(({ confirmPassword, password }) => confirmPassword === password, {
      message: "Passwords do not match",
      path: ["confirmPassword"]
    });

type FormData = z.infer<ReturnType<typeof createSchema>>;

const EnterPasswordStep = ({
  verificationToken,
  onComplete,
  onBack,
  isPreview
}: {
  verificationToken: string;
  onComplete: () => void;
  onBack: () => void;
  isPreview: boolean;
}) => {
  const { config } = useServerConfig();
  const {
    formState: { errors, isSubmitting, submitCount },
    handleSubmit,
    register,
    setError,
    watch
  } = useForm<FormData>({
    resolver: zodResolver(createSchema(config.passwordPolicy)),
    mode: "onChange",
    defaultValues: { password: "", confirmPassword: "" }
  });
  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const { breachStatus, validatePassword } = usePasswordBreachCheck({
    password,
    policy: config.passwordPolicy
  });
  const { mutateAsync: resetPasswordV2, isPending } = useResetPasswordV2();

  const handlePasswordReset = async ({ password: nextPassword }: FormData) => {
    if (isPreview) return;
    const latestBreachStatus = await validatePassword(nextPassword);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "This password was found in a known data breach."
      });
      return;
    }
    await resetPasswordV2({ newPassword: nextPassword, verificationToken });
    onComplete();
  };

  let disabledReason: string | undefined;
  if (breachStatus === "checking") disabledReason = "Checking known data breaches";
  else if (breachStatus === "breached") disabledReason = "Choose a password that isn't breached";

  return (
    <AuthPage
      pageTitle="Account Recovery"
      title="Enter a new password"
      titleAction={
        <Button type="button" variant="link" onClick={onBack}>
          Back
        </Button>
      }
    >
      <form onSubmit={handleSubmit(handlePasswordReset)} noValidate>
        <Stack gap={16}>
          <NewPasswordFields
            register={register}
            errors={errors}
            password={password}
            confirmPassword={confirmPassword}
            policy={config.passwordPolicy}
            breachStatus={breachStatus}
            submitCount={submitCount}
          />
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="w-full"
            loading={isSubmitting || isPending}
            disabledReason={disabledReason}
          >
            Change password
          </Button>
        </Stack>
      </form>
    </AuthPage>
  );
};

export const AccountRecoveryResetPage = () => {
  const preview = useAuthPreview();
  const isPreview = Boolean(preview);
  const navigate = useNavigate();
  const { token, to } = useSearch({ from: "/v4/_v4-auth/account-recovery-reset" });
  const email = isPreview ? "ada@acme.dev" : to;
  const [userDetails, setUserDetails] = useState({
    verificationToken: "",
    hasEmailAuthEnabled: preview === "method",
    userEncryptionVersion: UserEncryptionVersion.V1
  });
  const [step, setStep] = useState<Steps>(
    (preview && PREVIEW_STEPS[preview]) || Steps.ConfirmEmail
  );
  const [isEnableEmailAuthOpen, setIsEnableEmailAuthOpen] = useState(false);
  const { mutateAsync: verifyRecoveryEmail, isPending: isVerifying } =
    useVerifyAccountRecoveryEmail();
  const enableEmailAuth = useEnableEmailAuthAccountRecovery();

  const handleRecoveryMethodSelect = (method: RecoveryMethod) => {
    if (method === RecoveryMethod.ChangePassword) {
      setStep(
        userDetails.userEncryptionVersion === UserEncryptionVersion.V2
          ? Steps.EnterNewPassword
          : Steps.InputBackupKey
      );
    } else {
      setIsEnableEmailAuthOpen(true);
    }
  };

  const handleEnableEmailAuth = async () => {
    await enableEmailAuth.mutateAsync(userDetails.verificationToken);
    setUserDetails((prev) => ({ ...prev, hasEmailAuthEnabled: true }));
    setIsEnableEmailAuthOpen(false);
    toast.success("Email authentication has been enabled for your account.");
  };

  const handleConfirmEmail = async () => {
    if (isPreview) return;
    try {
      const response = await verifyRecoveryEmail({ email, code: token });
      setUserDetails((prev) => ({
        ...prev,
        verificationToken: response.token,
        userEncryptionVersion: response.userEncryptionVersion,
        hasEmailAuthEnabled: response.user.authMethods.includes(AuthMethod.EMAIL)
      }));
      setStep(Steps.SelectRecoveryMethod);
    } catch (err) {
      console.log("ERROR", err);
      navigate({ to: "/v4/email-not-verified" });
    }
  };

  if (step === Steps.EnterNewPassword) {
    return (
      <EnterPasswordStep
        verificationToken={userDetails.verificationToken}
        onComplete={() => navigate({ to: "/v4/login" })}
        onBack={() => setStep(Steps.SelectRecoveryMethod)}
        isPreview={isPreview}
      />
    );
  }

  if (step === Steps.ConfirmEmail) {
    return (
      <AuthPage
        pageTitle="Account Recovery"
        title="Confirm your email"
        description={
          <>
            Recover the account for <span className={styles.recipient}>{email}</span>
          </>
        }
      >
        <Button
          type="button"
          variant="accent"
          size="lg"
          className="w-full"
          loading={isVerifying}
          onClick={handleConfirmEmail}
        >
          Confirm email
        </Button>
      </AuthPage>
    );
  }

  const methods = [
    {
      method: RecoveryMethod.ChangePassword,
      label: "Change your password",
      description: "Use this if you normally sign in with email and password.",
      disabledReason: userDetails.hasEmailAuthEnabled
        ? undefined
        : "You need email sign-in enabled to use this recovery method."
    },
    {
      method: RecoveryMethod.DomainOrSSOChange,
      label: "Domain or SSO change",
      description:
        "Use this if you only signed in with Google or SSO and lost that account after a company domain change.",
      disabledReason: userDetails.hasEmailAuthEnabled
        ? "You already have email sign-in enabled."
        : undefined
    }
  ];

  return (
    <AuthPage
      pageTitle="Account Recovery"
      title="Recover your account"
      description={
        <>
          Email verified for <span className={styles.recipient}>{email}</span>
        </>
      }
      wide
    >
      <List label="Recovery methods">
        {methods.map(({ method, label, description, disabledReason }) => (
          <ListRow
            key={method}
            value={method}
            label={label}
            title={label}
            description={disabledReason ? `${description} ${disabledReason}` : description}
            media={<Icon name="key" size={18} />}
            disabled={Boolean(disabledReason)}
            onClick={() => handleRecoveryMethodSelect(method)}
            actions={<Icon name="chev-right" size={16} />}
          />
        ))}
      </List>
      <Text muted>
        If your company changed email domains and you used Google sign-in, choose Domain or SSO
        change to set a password for your new email.
      </Text>
      <AlertDialog open={isEnableEmailAuthOpen} onOpenChange={setIsEnableEmailAuthOpen}>
        <AlertDialogContent confirmText="enable" pending={enableEmailAuth.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable email authentication</AlertDialogTitle>
            <AlertDialogDescription>
              Enable email and password sign-in for {email}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="accent"
              onClick={(event) => {
                event.preventDefault();
                handleEnableEmailAuth();
              }}
            >
              Enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthPage>
  );
};
