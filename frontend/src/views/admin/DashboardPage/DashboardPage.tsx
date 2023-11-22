import { useEffect } from "react";
import { useRouter } from "next/router";

import { ContentLoader, Switch, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useOrganization, useServerConfig, useUser } from "@app/context";
import { useUpdateServerConfig } from "@app/hooks/api";

enum TabSections {
  Settings = "settings"
}

export const AdminDashboardPage = () => {
  const router = useRouter();
  const data = useServerConfig();
  const { config } = data;
  const { user, isLoading: isUserLoading } = useUser();
  const { orgs } = useOrganization();
  const { mutate: updateServerConfig } = useUpdateServerConfig();

  const isNotAllowed = !user?.superAdmin;

  useEffect(() => {
    if (isNotAllowed && !isUserLoading) {
      if (orgs?.length) {
        localStorage.setItem("orgData.id", orgs?.[0]?._id);
        router.push(`/org/${orgs?.[0]?._id}/overview`);
      }
    }
  }, [isNotAllowed, isUserLoading]);

  return (
    <div className="container mx-auto max-w-7xl pb-12 text-white dark:[color-scheme:dark]">
      <div className="mb-8">
        <div className="mb-4 mt-6 flex flex-col items-start justify-between text-xl">
          <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
          <p className="text-base text-bunker-300">Manage your Infisical</p>
        </div>
      </div>
      {isUserLoading || isNotAllowed ? (
        <ContentLoader text={isNotAllowed ? "Redirecting to org page..." : undefined} />
      ) : (
        <div>
          <Tabs defaultValue={TabSections.Settings}>
            <TabList>
              <div className="flex flex-row border-b border-mineshaft-600 w-full">
                <Tab value={TabSections.Settings}>General</Tab>
              </div>
            </TabList>
            <TabPanel value={TabSections.Settings}>
              <div className="flex items-center space-x-4">
                <Switch
                  id="disable-invite"
                  isChecked={Boolean(config?.allowSignUp)}
                  onCheckedChange={(isChecked) => updateServerConfig({ allowSignUp: isChecked })}
                />
                <div className="flex-grow">Enable signup or invite</div>
              </div>
            </TabPanel>
          </Tabs>
        </div>
      )}
    </div>
  );
};
