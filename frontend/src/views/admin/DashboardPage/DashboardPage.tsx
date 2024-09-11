import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { faAt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ContentLoader,
  FormControl,
  Input,
  Select,
  SelectClear,
  SelectItem,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import { useOrganization, useServerConfig, useUser } from "@app/context";
import { useGetOrganizations, useUpdateServerConfig } from "@app/hooks/api";

import { AuthPanel } from "./AuthPanel";
import { IntegrationPanel } from "./IntegrationPanel";
import { RateLimitPanel } from "./RateLimitPanel";
import { UserPanel } from "./UserPanel";

enum TabSections {
  Settings = "settings",
  Auth = "auth",
  RateLimit = "rate-limit",
  Integrations = "integrations",
  Users = "users"
}

enum SignUpModes {
  Disabled = "disabled",
  Anyone = "anyone"
}

const formSchema = z.object({
  signUpMode: z.nativeEnum(SignUpModes),
  allowedSignUpDomain: z.string().optional().nullable(),
  trustSamlEmails: z.boolean(),
  trustLdapEmails: z.boolean(),
  trustOidcEmails: z.boolean(),
  defaultAuthOrgId: z.string()
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
      allowedSignUpDomain: config.allowedSignUpDomain,
      trustSamlEmails: config.trustSamlEmails,
      trustLdapEmails: config.trustLdapEmails,
      trustOidcEmails: config.trustOidcEmails,
      defaultAuthOrgId: config.defaultAuthOrgId ?? ""
    }
  });

  const signUpMode = watch("signUpMode");
  const defaultAuthOrgId = watch("defaultAuthOrgId");

  const { user, isLoading: isUserLoading } = useUser();
  const { orgs } = useOrganization();
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();

  const organizations = useGetOrganizations();

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
      const { allowedSignUpDomain, trustSamlEmails, trustLdapEmails, trustOidcEmails } = formData;

      await updateServerConfig({
        defaultAuthOrgId: defaultAuthOrgId || null,
        allowSignUp: signUpMode !== SignUpModes.Disabled,
        allowedSignUpDomain: signUpMode === SignUpModes.Anyone ? allowedSignUpDomain : null,
        trustSamlEmails,
        trustLdapEmails,
        trustOidcEmails
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
          <p className="text-base text-bunker-300">Manage your instance level configurations.</p>
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
                <Tab value={TabSections.Auth}>Authentication</Tab>
                <Tab value={TabSections.RateLimit}>Rate Limit</Tab>
                <Tab value={TabSections.Integrations}>Integrations</Tab>
                <Tab value={TabSections.Users}>Users</Tab>
              </div>
            </TabList>
            <TabPanel value={TabSections.Settings}>
              <form
                className="mb-6 space-y-8 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
                onSubmit={handleSubmit(onFormSubmit)}
              >
                <div className="flex flex-col justify-start">
                  <div className="mb-2 text-xl font-semibold text-mineshaft-100">
                    Allow user signups
                  </div>
                  <div className="mb-4 max-w-sm text-sm text-mineshaft-400">
                    Select if you want users to be able to signup freely into your Infisical
                    instance.
                  </div>
                  <Controller
                    control={control}
                    name="signUpMode"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        className="max-w-sm"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          className="w-full bg-mineshaft-700"
                          dropdownContainerClassName="bg-mineshaft-800"
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
                {signUpMode === "anyone" && (
                  <div className="flex flex-col justify-start">
                    <div className="mb-4 text-xl font-semibold text-mineshaft-100">
                      Restrict signup by email domain(s)
                    </div>
                    <Controller
                      control={control}
                      defaultValue=""
                      name="allowedSignUpDomain"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Leave blank to allow any email domains"
                          className="w-72"
                          isError={Boolean(error)}
                          errorText={error?.message}
                        >
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="gmail.com, aws.com, redhat.com"
                            leftIcon={<FontAwesomeIcon icon={faAt} />}
                          />
                        </FormControl>
                      )}
                    />
                  </div>
                )}

                <div className="flex flex-col justify-start">
                  <div className="mb-2 text-xl font-semibold text-mineshaft-100">
                    Default organization
                  </div>
                  <div className="mb-4 max-w-sm text-sm text-mineshaft-400">
                    Select the default organization you want to set for SAML/LDAP based logins. When
                    selected, user logins will be automatically scoped to the selected organization.
                  </div>
                  <Controller
                    control={control}
                    name="defaultAuthOrgId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        className="max-w-sm"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          placeholder="Allow all organizations"
                          className="w-full bg-mineshaft-700"
                          dropdownContainerClassName="bg-mineshaft-800"
                          defaultValue={field.value ?? " "}
                          onValueChange={(e) => onChange(e)}
                          {...field}
                        >
                          <SelectClear
                            selectValue={defaultAuthOrgId}
                            onClear={() => {
                              console.log("clearing");
                              onChange("");
                            }}
                          >
                            Allow all organizations
                          </SelectClear>
                          {organizations.data?.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                </div>

                <div className="flex flex-col justify-start">
                  <div className="mb-2 text-xl font-semibold text-mineshaft-100">Trust emails</div>
                  <div className="mb-4 max-w-sm text-sm text-mineshaft-400">
                    Select if you want Infisical to trust external emails from SAML/LDAP/OIDC
                    identity providers. If set to false, then Infisical will prompt SAML/LDAP/OIDC
                    provisioned users to verify their email upon their first login.
                  </div>
                  <Controller
                    control={control}
                    name="trustSamlEmails"
                    render={({ field, fieldState: { error } }) => {
                      return (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                          <Switch
                            id="trust-saml-emails"
                            onCheckedChange={(value) => field.onChange(value)}
                            isChecked={field.value}
                          >
                            <p className="w-full">Trust SAML emails</p>
                          </Switch>
                        </FormControl>
                      );
                    }}
                  />
                  <Controller
                    control={control}
                    name="trustLdapEmails"
                    render={({ field, fieldState: { error } }) => {
                      return (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                          <Switch
                            id="trust-ldap-emails"
                            onCheckedChange={(value) => field.onChange(value)}
                            isChecked={field.value}
                          >
                            <p className="w-full">Trust LDAP emails</p>
                          </Switch>
                        </FormControl>
                      );
                    }}
                  />
                  <Controller
                    control={control}
                    name="trustOidcEmails"
                    render={({ field, fieldState: { error } }) => {
                      return (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                          <Switch
                            id="trust-oidc-emails"
                            onCheckedChange={(value) => field.onChange(value)}
                            isChecked={field.value}
                          >
                            <p className="w-full">Trust OIDC emails</p>
                          </Switch>
                        </FormControl>
                      );
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  isDisabled={isSubmitting || !isDirty}
                >
                  Save
                </Button>
              </form>
            </TabPanel>
            <TabPanel value={TabSections.Auth}>
              <AuthPanel />
            </TabPanel>
            <TabPanel value={TabSections.RateLimit}>
              <RateLimitPanel />
            </TabPanel>
            <TabPanel value={TabSections.Integrations}>
              <IntegrationPanel />
            </TabPanel>
            <TabPanel value={TabSections.Users}>
              <UserPanel />
            </TabPanel>
          </Tabs>
        </div>
      )}
    </div>
  );
};
