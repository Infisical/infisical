import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverview } from "../secret-manager/overview";

const CmekManagerOverviewPage = () => <ProductOverview type={ProjectType.Cmek} />;

Object.assign(CmekManagerOverviewPage, { requireAuth: true });

export default CmekManagerOverviewPage;
