import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { CreditCardTab, SecureNoteTab, WebLoginTab } from "@app/views/Org/UserSecretsPage";

import { useUserSecretsController } from "./user-secrets.controller";
import { TabTypes } from "./user-secrets.types";


export default function UserSecrets() {
  const { activeTab, updateSelectedTab } = useUserSecretsController();
  const getHeadingTextUI = () => (
    <div>
      <div className="mt-6 text-3xl font-semibold text-gray-200">User Secrets</div>
      <div className="mb-6 text-lg text-mineshaft-300">Store you secrets here</div>
    </div>
  );

  const getTabUI = () => (
    <Tabs value={activeTab} onValueChange={updateSelectedTab}>
      <TabList>
        <Tab value={TabTypes.WebLogin}>Web Login</Tab>
        <Tab value={TabTypes.CreditCard}>Credit Card</Tab>
        <Tab value={TabTypes.SecureNote}>Secure Note</Tab>
      </TabList>
      <TabPanel value={TabTypes.WebLogin}>
        <WebLoginTab />
      </TabPanel>
      <TabPanel value={TabTypes.CreditCard}>
        <CreditCardTab />
      </TabPanel>
      <TabPanel value={TabTypes.SecureNote}>
        <SecureNoteTab />
      </TabPanel>
    </Tabs>
  );

  return (
    <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 px-6 text-white">
      {getHeadingTextUI()}
      {getTabUI()}
    </div>
  );
}

UserSecrets.requireAuth = true;
