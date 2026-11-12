import { useOrganization } from "@app/context";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetSecretScanningInstanceState } from "@app/hooks/api/secretScanningV2";

const SINGLE_PROJECT_PRODUCTS: string[] = [
  ProjectType.CertificateManager,
  ProjectType.SecretScanning,
  ProjectType.PAM
];

export const isSingleProjectProduct = (type: string) => SINGLE_PROJECT_PRODUCTS.includes(type);

// Legacy orgs can still hold several Certificate Manager or Secret Scanning instances. Whether they do
// comes from the org, not from the projects the viewer can see, so instance names show whenever they
// are needed to tell rows apart.
export const useIsNamedByProduct = () => {
  const { currentOrg } = useOrganization();
  const { data: certManagerInstance } = useCertManagerInstanceState();
  const { data: secretScanningInstance } = useGetSecretScanningInstanceState(currentOrg.id);

  return (type: string) => {
    if (!isSingleProjectProduct(type)) return false;
    if (type === ProjectType.CertificateManager) return !certManagerInstance?.isMultiInstance;
    if (type === ProjectType.SecretScanning) return !secretScanningInstance?.isMultiInstance;
    return true;
  };
};
