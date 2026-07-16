import { ComponentProps } from "react";
import { Helmet } from "react-helmet";
import { Bell } from "lucide-react";

import { PageHeader } from "@app/components/v2";

import { AlarmsTable } from "./components/AlarmsTable";

type Props = {
  projectId?: string;
  scopeName?: string;
  scope: ComponentProps<typeof PageHeader>["scope"];
};

export const AlarmsPage = ({ projectId, scopeName, scope }: Props) => {
  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>Infisical | Alarms</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 pb-6 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={scope}
            icon={Bell}
            title="Alarms"
            description="Route resource events to recipients over your channels. An alarm covers a bound resource, or every resource matching a filter."
          />
          <AlarmsTable projectId={projectId} scopeName={scopeName} />
        </div>
      </div>
    </div>
  );
};
