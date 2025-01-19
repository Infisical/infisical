import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverviewPage } from "../ProductOverviewPage";

export const CertManagerOverviewPage = () => (
  <ProductOverviewPage type={ProjectType.CertificateManager} />
);
