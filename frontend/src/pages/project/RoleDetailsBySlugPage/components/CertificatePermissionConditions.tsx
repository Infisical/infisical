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
        { value: "id", label: "Certificate ID" },
        { value: "commonName", label: "Common Name" },
        { value: "altNames", label: "Subject Alternative Names" },
        { value: "serialNumber", label: "Serial Number" }
      ]}
    />
  );
};
