import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverviewPage } from "../ProductOverviewPage";

export const KmsOverviewPage = () => <ProductOverviewPage type={ProjectType.KMS} />;
