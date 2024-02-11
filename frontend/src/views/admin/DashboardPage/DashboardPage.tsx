import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { faAt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

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

const formSchema = yup.object({
  signUpMode: yup
    .string()
    .oneOf(["disabled", "invite-only", "anyone"])
    .required(),
  allowedSignUpDomain: yup.string().optional()
});

type TDashboardForm = yup.InferType<typeof formSchema>;

export const AdminDashboardPage = () => {
  const router = useRouter();
  const data = useServerConfig();
  const { config } = data;

  const signUpStatus = config.allowSignUp
  ? config.inviteOnlySignUp && "invite-only"
  : "disabled";

  const signUpType = signUpStatus || "anyone";
  
  const { control, handleSubmit, watch } = useForm<TDashboardForm>({
    resolver: yupResolver(formSchema),
    defaultValues: {
      signUpMode: signUpType,
      allowedSignUpDomain: config.allowedSignUpDomain
    }
  });

  const signupMode = watch("signUpMode");

  const { user, isLoading: isUserLoading } = useUser();
  const { orgs } = useOrganization();
  const { mutate: updateServerConfig } = useUpdateServerConfig();

  const { createNotification } = useNotificationContext();

  const isNotAllowed = !user?.superAdmin;

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
        allowSignUp: signUpMode !== "disabled",
        inviteOnlySignUp: signUpMode === "invite-only",
        allowedSignUpDomain: signUpMode === "anyone" ? allowedSignUpDomain : ""
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
                          <SelectItem value="disabled">Disabled</SelectItem>
                          <SelectItem value="invite-only">Invite Only</SelectItem>
                          <SelectItem value="anyone">Anyone</SelectItem>
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
                            placeholder="domain.com, domain2.com"
                            leftIcon={<FontAwesomeIcon icon={faAt} />}
                          />
                        </FormControl>
                      )}
                    />
                  </div>
                )}

                <Button colorSchema="primary" variant="outline_bg" type="submit">
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
