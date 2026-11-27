import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3/platform";
import { ProjectType } from "@app/hooks/api/projects/types";

import { LegacyProjectsSection } from "./LegacyProjectsSection";

export const ProductSettingsPage = () => (
  <>
    <PageTitle title="Product Settings" />
    <div className="mx-auto w-full max-w-8xl bg-page text-foreground-inverse">
      <PageHeader
        scope={ProjectType.SecretScanning}
        title="Product Settings"
        description="View the Secret Scanning projects in your organization."
      />
      <div className="flex flex-col gap-4 pb-8">
        <LegacyProjectsSection />
      </div>
    </div>
  </>
);
