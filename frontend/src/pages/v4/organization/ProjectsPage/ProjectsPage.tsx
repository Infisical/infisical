import { Icon } from "@infisical/cipher/ui/icon";
import { Item } from "@infisical/cipher/ui/item";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { useParams } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref } from "../../links";
import { useGetStarted } from "../../shell/corner";
import { productOf, projectBase } from "../../shell/navigation";
import { HomeQueues } from "./HomeQueues";
import { HomeTiles } from "./HomeTiles";

export const ProjectsPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const { organization, projects } = useV4Session();
  const { data: queue } = useV4Adapter("home").useQueue(orgId);
  const getStarted = useGetStarted(orgId);
  const demoProject =
    useV4Mode() === "demo"
      ? projects.find((project) => project.type === ProjectType.SecretManager)
      : undefined;
  const quietSetup = getStarted.active && !queue?.approvals.length && !queue?.attention.length;

  return (
    <Stack gap={32}>
      <PageHeader
        title={`${organization.isSubOrganization ? "Sub-organization" : "Organization"} overview`}
      />
      {demoProject && (
        <Item
          asChild
          variant="outline"
          icon={productOf(demoProject.type).icon}
          title={demoProject.name}
          description={`Continue in ${productOf(demoProject.type).label}`}
          actions={<Icon name="chev-right" size={16} />}
        >
          <a href={orgHref(orgId, `${projectBase(demoProject.type, demoProject.id)}/overview`)}>
            {demoProject.name}
          </a>
        </Item>
      )}
      <HomeTiles orgId={orgId} />
      {queue && !quietSetup && <HomeQueues queue={queue} />}
    </Stack>
  );
};
