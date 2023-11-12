import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { generateBackupPDFAsync } from "@app/components/utilities/generateBackupPDF";
// TODO(akhilmhdh): rewrite this into module functions in lib
import { saveTokenToLocalStorage } from "@app/components/utilities/saveTokenToLocalStorage";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, ContentLoader, FormControl, Input } from "@app/components/v2";
import { useServerConfig } from "@app/context";
import { useCreateAdminUser } from "@app/hooks/api";
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
  const { createNotification } = useNotificationContext();
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

  const handleFormSubmit = async ({ email, password, firstName, lastName }: TFormSchema) => {
    // avoid multi submission
    if (isSubmitting) return;
    try {
      const { privateKey, ...userPass } = await generateUserPassKey(email, password);
      const res = await createAdminUser({
        email,
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
      setStep(SignupSteps.BackupKey);
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Faield to create admin"
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
        text: "Faield to generate backup"
      });
    }
  };

  if (config?.initialized && step === SignupSteps.DetailsForm)
    return <ContentLoader text="Redirecting to admin page..." />;

  return (
    <div className="flex justify-center items-center">
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
            <div className="text-center flex flex-col items-center space-y-4">
              <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
              <div className="text-4xl">Welcome to Infisical</div>
              <div>Create your first Admin Account</div>
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
                        <Input isFullWidth size="lg" {...field} />
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
                        <Input isFullWidth size="lg" {...field} />
                      </FormControl>
                    )}
                  />
                </div>
                <Controller
                  control={control}
                  name="email"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl label="Email" errorText={error?.message} isError={Boolean(error)}>
                      <Input isFullWidth size="lg" {...field} />
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
                      <Input isFullWidth size="lg" type="password" {...field} />
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
                      <Input isFullWidth size="lg" type="password" {...field} />
                    </FormControl>
                  )}
                />
              </div>
              <Button type="submit" isFullWidth className="mt-4" isLoading={isSubmitting}>
                Let&apos;s Go
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
