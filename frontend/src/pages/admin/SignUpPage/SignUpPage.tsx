import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";

// TODO(akhilmhdh): rewrite this into module functions in lib
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, ContentLoader, FormControl, Input } from "@app/components/v2";
import { useServerConfig } from "@app/context";
import { useCreateAdminUser, useSelectOrganization } from "@app/hooks/api";

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

export const SignUpPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema)
  });

  const { config } = useServerConfig();
  const { mutateAsync: createAdminUser } = useCreateAdminUser();
  const { mutateAsync: selectOrganization } = useSelectOrganization();

  const handleFormSubmit = async ({ email, password, firstName, lastName }: TFormSchema) => {
    // avoid multi submission
    if (isSubmitting) return;
    const res = await createAdminUser({
      email,
      password,
      firstName,
      lastName
    });

    SecurityClient.setToken(res.token);
    await selectOrganization({ organizationId: res.organization.id });

    // TODO(akhilmhdh): This is such a confusing pattern and too unreliable
    // Will be refactored in next iteration to make it url based rather than local storage ones
    // Part of migration to nextjs 14
    localStorage.setItem("orgData.id", res.organization.id);
    navigate({ to: "/admin" });
  };

  if (config?.initialized) {
    return (
      <div className="flex min-h-screen flex-col justify-center bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <ContentLoader text="Redirecting to admin page..." />
      </div>
    );
  }

  return (
    <div className="flex max-h-screen min-h-screen flex-col justify-center overflow-y-auto bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6">
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") ?? ""} />
        <meta name="og:description" content={t("signup.og-description") ?? ""} />
      </Helmet>
      <div className="flex items-center justify-center">
        <AnimatePresence mode="wait">
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
        </AnimatePresence>
      </div>
    </div>
  );
};
