import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverviewPage } from "../SecretManagerOverviewPage/SecretManagerOverviewPage";

export const SshOverviewPage = () => <ProductOverviewPage type={ProjectType.SSH} />;
