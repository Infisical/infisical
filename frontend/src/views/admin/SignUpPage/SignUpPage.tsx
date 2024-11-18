import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { generateBackupPDFAsync } from "@app/components/utilities/generateBackupPDF";
// TODO(akhilmhdh): rewrite this into module functions in lib
import { saveTokenToLocalStorage } from "@app/components/utilities/saveTokenToLocalStorage";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, ContentLoader, FormControl, Input } from "@app/components/v2";
import { useServerConfig } from "@app/context";
import { useCreateAdminUser, useSelectOrganization } from "@app/hooks/api";
import { generateUserBackupKey, generateUserPassKey } from "@app/lib/crypto";
import { isLoggedIn } from "@app/reactQuery";

import { DownloadBackupKeys } from "./components/DownloadBackupKeys";

const formSchema = z
  .object({
    email: z.string().email().trim(),
    firstName: z.string().trim(),
    lastName: z.string().trim().optional(),
    password: z.string().trim().min(14).max(100),
    confirmPassword: z.string().trim()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password don't match",
    path: ["confirmPassword"]
  });

type TFormSchema = z.infer<typeof formSchema>;

enum SignupSteps {
  DetailsForm = "details-form",
  BackupKey = "backup-key"
}

export const SignUpPage = () => {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    getValues,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema)
  });
  
  const [step, setStep] = useState(SignupSteps.DetailsForm);

  const { config } = useServerConfig();

  useEffect(() => {
    if (config?.initialized) {
      if (isLoggedIn()) {
        router.push("/admin");
      } else {
        router.push("/login");
      }
    }
  }, []);

  const { mutateAsync: createAdminUser } = useCreateAdminUser();
  const { mutateAsync: selectOrganization } = useSelectOrganization();

  const handleFormSubmit = async ({ email, password, firstName, lastName }: TFormSchema) => {
    // avoid multi submission
    if (isSubmitting) return;
    try {
      const { privateKey, ...userPass } = await generateUserPassKey(email, password);
      const res = await createAdminUser({
        email,
        password,
        firstName,
        lastName,
        ...userPass
      });

      SecurityClient.setToken(res.token);
      saveTokenToLocalStorage({
        publicKey: userPass.publicKey,
        encryptedPrivateKey: userPass.encryptedPrivateKey,
        iv: userPass.encryptedPrivateKeyIV,
        tag: userPass.encryptedPrivateKeyTag,
        privateKey
      });
      await selectOrganization({ organizationId: res.organization.id });

      // TODO(akhilmhdh): This is such a confusing pattern and too unreliable
      // Will be refactored in next iteration to make it url based rather than local storage ones
      // Part of migration to nextjs 14
      localStorage.setItem("orgData.id", res.organization.id);
      setStep(SignupSteps.BackupKey);
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to create admin"
      });
    }
  };

  const handleBackupKeyGenerate = async () => {
    try {
      const { email, password, firstName, lastName } = getValues();
      const generatedKey = await generateUserBackupKey(email, password);
      await generateBackupPDFAsync({
        generatedKey,
        personalEmail: email,
        personalName: `${firstName} ${lastName}`
      });
      router.push("/admin");
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to generate backup"
      });
    }
  };

  if (config?.initialized && step === SignupSteps.DetailsForm)
    return <ContentLoader text="Redirecting to admin page..." />;

  return (
    <div className="flex items-center justify-center">
      <AnimatePresence exitBeforeEnter>
        {step === SignupSteps.DetailsForm && (
          <motion.div
            className="text-mineshaft-200"
            key="panel-1"
            transition={{ duration: 0.15 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
              <div className="pt-4 text-4xl">Welcome to Infisical</div>
              <div className="pb-4 text-bunker-300">Create your first Super Admin Account</div>
            </div>
            <form onSubmit={handleSubmit(handleFormSubmit)}>
              <div className="mt-8">
                <div className="flex items-center space-x-4">
                  <Controller
                    control={control}
                    name="firstName"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="First name"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Input isFullWidth size="md" {...field} />
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="lastName"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Last name"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Input isFullWidth size="md" {...field} />
                      </FormControl>
                    )}
                  />
                </div>
                <Controller
                  control={control}
                  name="email"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl label="Email" errorText={error?.message} isError={Boolean(error)}>
                      <Input isFullWidth size="md" {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="password"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Password"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input isFullWidth size="md" type="password" {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Confirm password"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input isFullWidth size="md" type="password" {...field} />
                    </FormControl>
                  )}
                />
              </div>
              <Button
                type="submit"
                colorSchema="primary"
                variant="outline_bg"
                isFullWidth
                className="mt-4"
                isLoading={isSubmitting}
              >
                Continue
              </Button>
            </form>
          </motion.div>
        )}
        {step === SignupSteps.BackupKey && (
          <motion.div
            className="text-mineshaft-200"
            key="panel-2"
            transition={{ duration: 0.15 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
          >
            <DownloadBackupKeys onGenerate={handleBackupKeyGenerate} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
