import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3";

import { ServerAdminsTable } from "./components";

export const AccessManagementPage = () => {
  return (
    <div className="h-full text-foreground">
      <PageTitle title="Access Control" />
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <PageHeader
            scope="instance"
            title="Server Admin Access Control"
            description="Manage server admins within your Infisical instance."
          />
          <ServerAdminsTable />
        </div>
      </div>
    </div>
  );
};
