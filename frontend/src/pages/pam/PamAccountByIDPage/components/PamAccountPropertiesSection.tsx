import { format } from "date-fns";
import { CopyIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Detail,
  DetailLabel,
  DetailValue,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { PamResourceType, TPamAccount, TWindowsAccount } from "@app/hooks/api/pam";

const CopyableField = ({ label, value }: { label: string; value: string }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    createNotification({
      text: `${label} copied to clipboard`,
      type: "info"
    });
  };

  return (
    <Detail>
      <DetailLabel>{label}</DetailLabel>
      <DetailValue>
        <div className="flex items-center gap-2">
          <UnstableInput value={value} readOnly className="flex-1 font-mono text-sm" />
          <UnstableIconButton variant="ghost" onClick={handleCopy} size="sm">
            <CopyIcon />
          </UnstableIconButton>
        </div>
      </DetailValue>
    </Detail>
  );
};

type TPropertyField = {
  label: string;
  value: string;
  type?: "text" | "date" | "plain";
};

const getAccountProperties = (account: TPamAccount): TPropertyField[] => {
  if (!account.resource) return [];
  switch (account.resource.resourceType) {
    case PamResourceType.Windows: {
      const { internalMetadata } = account as TWindowsAccount;
      const fields: TPropertyField[] = [];

      if (internalMetadata.sid) {
        fields.push({ label: "SID", value: internalMetadata.sid });
      }
      if (internalMetadata.enabled !== undefined) {
        fields.push({
          label: "Enabled",
          value: internalMetadata.enabled ? "Yes" : "No",
          type: "plain"
        });
      }
      if (internalMetadata.passwordLastSet) {
        fields.push({
          label: "Password Last Set",
          value: internalMetadata.passwordLastSet,
          type: "date"
        });
      }
      if (internalMetadata.lastLogon) {
        fields.push({ label: "Last Logon", value: internalMetadata.lastLogon, type: "date" });
      }

      return fields;
    }
    default:
      return [];
  }
};

type Props = {
  account: TPamAccount;
};

export const PamAccountPropertiesSection = ({ account }: Props) => {
  const properties = getAccountProperties(account);

  if (properties.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="border-b border-border pb-2">
        <h3 className="text-lg font-medium">Properties</h3>
      </div>
      {properties.map((property) => {
        if (property.type === "date") {
          return (
            <Detail key={property.label}>
              <DetailLabel>{property.label}</DetailLabel>
              <DetailValue>{format(new Date(property.value), "MM/dd/yyyy, hh:mm a")}</DetailValue>
            </Detail>
          );
        }
        if (property.type === "plain") {
          return (
            <Detail key={property.label}>
              <DetailLabel>{property.label}</DetailLabel>
              <DetailValue>{property.value}</DetailValue>
            </Detail>
          );
        }
        return <CopyableField key={property.label} label={property.label} value={property.value} />;
      })}
    </div>
  );
};
