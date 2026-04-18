import { CertificatesSection } from "../../../CertificatesPage/components/CertificatesSection";
import type { FilterRule } from "../../../CertificatesPage/components/inventory-types";

type Props = {
  externalFilter?: {
    certificateId?: string;
    search?: string;
  };
  dashboardFilters?: FilterRule[];
  dashboardViewId?: string;
};

export const CertificatesTab = ({ externalFilter, dashboardFilters, dashboardViewId }: Props) => {
  return (
    <CertificatesSection
      externalFilter={externalFilter}
      dashboardFilters={dashboardFilters}
      dashboardViewId={dashboardViewId}
    />
  );
};
