import { ProjectType } from "@app/hooks/api/workspace/types";
import { ProductOverview } from "../secret-manager/overview";

const CertManagerOverviewPage = () => <ProductOverview type={ProjectType.CertificateManager} />;

Object.assign(CertManagerOverviewPage, { requireAuth: true });

export default CertManagerOverviewPage;
