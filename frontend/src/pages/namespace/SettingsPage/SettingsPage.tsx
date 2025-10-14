import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";

import { DeleteNamespaceSection } from "./components/DeleteNamespaceSection";
import { OverviewSection } from "./components/OverviewSection";

export const SettingsPage = () => {
  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>Namespace Settings</title>
      </Helmet>
      <div className="w-full max-w-7xl">
        <PageHeader title="Settings" />
        <OverviewSection />
        <DeleteNamespaceSection />
      </div>
    </div>
  );
};
