import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverviewPage } from "../ProductOverviewPage";

export const SshOverviewPage = () => <ProductOverviewPage type={ProjectType.SSH} />;
