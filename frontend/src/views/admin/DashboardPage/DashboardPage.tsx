import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { faAt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  ContentLoader,
  FormControl,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import { useOrganization, useServerConfig, useUser } from "@app/context";
import { useUpdateServerConfig } from "@app/hooks/api";

enum TabSections {
  Settings = "settings"
}

enum SignUpModes {
  Disabled = "disabled",
  Anyone = "anyone"
}

const formSchema = z.object({
  signUpMode: z.nativeEnum(SignUpModes),
  allowedSignUpDomain: z.string().optional().nullable()
});

type TDashboardForm = z.infer<typeof formSchema>;
export const AdminDashboardPage = () => {
  const router = useRouter();
  const data = useServerConfig();
  const { config } = data;

  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<TDashboardForm>({
    resolver: zodResolver(formSchema),
    values: {
      // eslint-disable-next-line
      signUpMode: config.allowSignUp ? SignUpModes.Anyone : SignUpModes.Disabled,
      allowedSignUpDomain: config.allowedSignUpDomain
    }
  });

  const signupMode = watch("signUpMode");

  const { user, isLoading: isUserLoading } = useUser();
  const { orgs } = useOrganization();
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();

  const { createNotification } = useNotificationContext();

  const isNotAllowed = !user?.superAdmin;

  // TODO(akhilmhdh): on nextjs 14 roadmap this will be properly addressed with context split
  useEffect(() => {
    if (isNotAllowed && !isUserLoading) {
      if (orgs?.length) {
        localStorage.setItem("orgData.id", orgs?.[0]?.id);
        router.push(`/org/${orgs?.[0]?.id}/overview`);
      }
    }
  }, [isNotAllowed, isUserLoading]);

  const onFormSubmit = async (formData: TDashboardForm) => {
    try {
      const { signUpMode, allowedSignUpDomain } = formData;
      await updateServerConfig({
        allowSignUp: signUpMode !== SignUpModes.Disabled,
        allowedSignUpDomain: signUpMode === SignUpModes.Anyone ? allowedSignUpDomain : null
      });
      createNotification({
        text: "Successfully changed sign up setting.",
        type: "success"
      });
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to update sign up setting."
      });
    }
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 pb-12 text-white dark:[color-scheme:dark]">
      <div className="mx-auto mb-6 w-full max-w-7xl pt-6">
        <div className="mb-8 flex flex-col items-start justify-between text-xl">
          <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
          <p className="text-base text-bunker-300">Manage your Infisical instance.</p>
        </div>
      </div>
      {isUserLoading || isNotAllowed ? (
        <ContentLoader text={isNotAllowed ? "Redirecting to org page..." : undefined} />
      ) : (
        <div>
          <Tabs defaultValue={TabSections.Settings}>
            <TabList>
              <div className="flex w-full flex-row border-b border-mineshaft-600">
                <Tab value={TabSections.Settings}>General</Tab>
              </div>
            </TabList>
            <TabPanel value={TabSections.Settings}>
              <form
                className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
                onSubmit={handleSubmit(onFormSubmit)}
              >
                <div className="flex justify-between">
                  <div className="mb-4 text-xl font-semibold text-mineshaft-100">
                    Allow user to Sign Up
                  </div>
                  <Controller
                    control={control}
                    name="signUpMode"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        className="max-w-72 w-72"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          className="w-72 bg-mineshaft-700"
                          dropdownContainerClassName="bg-mineshaft-700"
                          defaultValue={field.value}
                          onValueChange={(e) => onChange(e)}
                          {...field}
                        >
                          <SelectItem value={SignUpModes.Disabled}>Disabled</SelectItem>
                          <SelectItem value={SignUpModes.Anyone}>Anyone</SelectItem>
                        </Select>
                      </FormControl>
                    )}
                  />
                </div>
                {signupMode === "anyone" && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="mb-4 flex text-mineshaft-100">
                      Allow email with only specific domain(s)
                    </div>
                    <Controller
                      control={control}
                      defaultValue=""
                      name="allowedSignUpDomain"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Leave blank to allow any domain handle"
                          className="w-72"
                          isError={Boolean(error)}
                          errorText={error?.message}
                        >
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="domain.com, domain2.com"
                            leftIcon={<FontAwesomeIcon icon={faAt} />}
                          />
                        </FormControl>
                      )}
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  isDisabled={isSubmitting || !isDirty}
                >
                  Save
                </Button>
              </form>
            </TabPanel>
          </Tabs>
        </div>
      )}
    </div>
  );
};
