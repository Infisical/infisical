import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverview } from "../secret-manager/overview";

const SshManagerOverviewPage = () => <ProductOverview type={ProjectType.SSH} />;

Object.assign(SshManagerOverviewPage, { requireAuth: true });

export default SshManagerOverviewPage;
