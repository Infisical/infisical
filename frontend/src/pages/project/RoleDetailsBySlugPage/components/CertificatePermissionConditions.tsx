import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const CertificatePermissionConditions = ({ position = 0, isDisabled }: Props) => {
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.Certificates}
      position={position}
      selectOptions={[
        {
          value: "commonName",
          label: "Common Name",
          description: "The common name (CN) of the certificate"
        },
        {
          value: "altNames",
          label: "Subject Alternative Names",
          description: "The subject alternative names (SANs) of the certificate"
        },
        {
          value: "serialNumber",
          label: "Serial Number",
          description: "The serial number of the certificate"
        }
      ]}
    />
  );
};
