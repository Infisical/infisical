import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverviewPage } from "../SecretManagerOverviewPage/SecretManagerOverviewPage";

export const SecretScanningOverviewPage = () => (
  <ProductOverviewPage type={ProjectType.SecretScanning} />
);
