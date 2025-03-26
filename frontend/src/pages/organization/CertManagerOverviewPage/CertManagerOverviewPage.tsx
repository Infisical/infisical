import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverviewPage } from "../SecretManagerOverviewPage/SecretManagerOverviewPage";

export const CertManagerOverviewPage = () => (
  <ProductOverviewPage type={ProjectType.CertificateManager} />
);
