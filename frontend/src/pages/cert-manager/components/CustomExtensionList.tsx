import { Badge, ButtonGroup } from "@app/components/v3";
import { customExtensionLabelFor } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

export type TCustomExtensionListEntry = {
  oid: string;
  critical?: boolean;
  value?: string;
  displayValue?: string | null;
  label?: string | null;
};

type Props = {
  extensions: TCustomExtensionListEntry[];
};

export const CustomExtensionList = ({ extensions }: Props) => {
  if (!extensions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {extensions.map((extension) => {
        const label = customExtensionLabelFor(extension.oid, extension.label);
        const value = extension.displayValue ?? extension.value;

        return value ? (
          <ButtonGroup className="max-w-full min-w-0" key={extension.oid}>
            <Badge isTruncatable className="max-w-[12rem] shrink-0">
              <span>{label}</span>
            </Badge>
            <Badge variant="outline" isTruncatable>
              <span>{value}</span>
            </Badge>
          </ButtonGroup>
        ) : (
          <Badge key={extension.oid} isTruncatable>
            <span>{label}</span>
          </Badge>
        );
      })}
    </div>
  );
};
