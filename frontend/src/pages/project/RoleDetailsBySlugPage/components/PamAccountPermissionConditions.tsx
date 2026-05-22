import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const PamAccountPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.PamAccounts}
      position={position}
      selectOptions={[
        {
          value: "accountName",
          label: "Account Name",
          description: "PAM account name"
        },
        {
          value: "metadataKey",
          label: "Metadata Key",
          description: "The key of a metadata pair (use with $elemMatch for nested matching)"
        },
        {
          value: "metadataValue",
          label: "Metadata Value",
          description: "The value of a metadata pair (use with $elemMatch for nested matching)"
        },
        {
          value: "resourceName",
          label: "Resource Name",
          description:
            "PAM resource the account belongs to. On Access, also matches the resource being connected through — for domain accounts this is the Windows host the credentials are used against, not the account's domain parent."
        },
        {
          value: "resourceType",
          label: "Resource Type",
          description:
            "PAM resource type (e.g. postgres, mysql, ssh). On Access for domain accounts, this is the connect-target resource's type rather than the account's domain type."
        },
        {
          value: "domainName",
          label: "Domain Name",
          description: "Name of the PAM domain this account belongs to"
        },
        {
          value: "domainType",
          label: "Domain Type",
          description: "PAM domain type (e.g. active-directory)"
        }
      ]}
    />
  );
};
