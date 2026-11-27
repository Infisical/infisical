import { useProjectScope } from "../../access/project/scope";
import { orgHref } from "../../links";
import { ProjectGeneralSettings } from "../../project/SettingsPage/general";
import { ProjectSettingsLayout } from "../../project/SettingsPage/layout";

export const SettingsPage = () => {
  const { orgId, projectId } = useProjectScope();
  return (
    <ProjectSettingsLayout
      tabs={[{ key: "tab-project-general", name: "Settings", Body: ProjectGeneralSettings }]}
      generalHref={orgHref(orgId, `/projects/kms/${projectId}/settings`)}
    />
  );
};
