import { ProductOverviewPage } from "../ProductOverviewPage";
import { ProjectType } from "@app/hooks/api/workspace/types";
// #TODO: Update all the workspaceIds
export const SecretManagerOverviewPage = () => (
  <ProductOverviewPage type={ProjectType.SecretManager} />
);
