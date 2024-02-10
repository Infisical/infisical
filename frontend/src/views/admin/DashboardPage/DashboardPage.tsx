import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { faAt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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

type SignUpMode = "disabled" | "invite-only" | "anyone";

export const AdminDashboardPage = () => {
  const router = useRouter();
  const data = useServerConfig();
  const [signUpMode, setSignUpMode] = useState<SignUpMode>("invite-only");
  const [allowSpecificDomain, setAllowSpecificDomain] = useState<string | undefined>();

  const { config } = data;
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

  useEffect(() => {
    if (!config.allowSignUp) {
      setSignUpMode("disabled");
      return;
    }
    if (config.inviteOnlySignUp) {
      setSignUpMode("invite-only");
    } else {
      setSignUpMode("anyone");
    }

    if (config.allowSpecificDomainSignUp) {
      setAllowSpecificDomain(config.allowSpecificDomainSignUp);
    }
  }, [config]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    config.allowSignUp = signUpMode !== "disabled";
    config.inviteOnlySignUp = signUpMode === "invite-only";
    config.allowSpecificDomainSignUp = signUpMode === "anyone" ? allowSpecificDomain : "";

    await updateServerConfig(config);

    createNotification({
      text: "Successfully changed sign up mode.",
      type: "success"
    });
  }

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
                onSubmit={handleSubmit}
                className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
              >
                <div className="flex justify-between">
                  <div className="mb-4 text-xl font-semibold text-mineshaft-100">
                    Allow user to Sign Up
                  </div>
                  <Select
                    className="w-60 bg-mineshaft-700"
                    dropdownContainerClassName="bg-mineshaft-700"
                    onValueChange={(state) => setSignUpMode(state as SignUpMode)}
                    value={signUpMode}
                    isDisabled={isNotAllowed}
                  >
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="invite-only">Invite Only</SelectItem>
                    <SelectItem value="anyone">Anyone</SelectItem>
                  </Select>
                </div>

                {signUpMode === "anyone" && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="mb-4 flex text-mineshaft-100">
                      Allow email with only specific domain
                    </div>
                    <FormControl label="Leave blank to allow any domain handle">
                      <div className="w-60">
                        <Input
                          placeholder="domain.com"
                          leftIcon={<FontAwesomeIcon icon={faAt} />}
                          value={allowSpecificDomain}
                          onChange={(ev) => setAllowSpecificDomain(ev.target.value)}
                        />
                      </div>
                    </FormControl>
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
