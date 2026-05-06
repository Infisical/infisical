import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { GatewayAwsAuthConfig } from "@app/hooks/api/gateways-v2/types";

const Field = ({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <Detail className={className}>
    <DetailLabel>{label}</DetailLabel>
    <DetailValue>
      {children ? <p className="break-words">{children}</p> : <p className="text-muted">—</p>}
    </DetailValue>
  </Detail>
);

type Props = {
  config: GatewayAwsAuthConfig;
};

export const ViewGatewayAwsAuthContent = ({ config }: Props) => {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
      <Field label="Allowed Principal ARNs" className="md:col-span-2">
        {config.allowedPrincipalArns
          ?.split(",")
          .map((a) => a.trim())
          .join(", ")}
      </Field>
      <Field label="Allowed Account IDs" className="md:col-span-2">
        {config.allowedAccountIds
          ?.split(",")
          .map((id) => id.trim())
          .join(", ")}
      </Field>
      <Field label="STS Endpoint" className="md:col-span-2">
        {config.stsEndpoint}
      </Field>
    </div>
  );
};
