import { LucideIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { AccessRestrictedDialog, PageHeader } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

type Props = {
  title: string;
  icon: LucideIcon;
  description: string;
  requirement: { action: string; subject: string };
};

// An Agent Vault page for a role that can't read what the page lists: its header, then the restricted state.
export const AgentVaultRestrictedPage = ({ title, icon, description, requirement }: Props) => (
  <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
    <PageTitle title={title} />
    <PageHeader
      scope={ProjectType.AgentVault}
      icon={icon}
      title={title}
      description={description}
    />
    <AccessRestrictedDialog requirement={requirement} />
  </div>
);
