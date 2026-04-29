import { useState } from "react";
import { faBan } from "@fortawesome/free-solid-svg-icons";

import { EmptyState, Spinner } from "@app/components/v2";
import { Button, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useGetResourceAwsAuth } from "@app/hooks/api/resourceAuthMethods";

import { AwsStartCommandDialog } from "./AwsStartCommandDialog";

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
      {children ? <p className="break-words">{children}</p> : <p className="text-muted">Not set</p>}
    </DetailValue>
  </Detail>
);

export const ViewGatewayAwsAuthContent = ({
  gatewayId,
  gatewayName
}: {
  gatewayId: string;
  gatewayName: string;
}) => {
  const { data, isPending } = useGetResourceAwsAuth({ type: "gateway", id: gatewayId });
  const [showStartCommand, setShowStartCommand] = useState(false);

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={faBan} title="Could not find AWS Auth on this gateway." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
        <Field label="Allowed Principal ARNs" className="md:col-span-2">
          {data.allowedPrincipalArns
            ?.split(",")
            .map((a) => a.trim())
            .join(", ")}
        </Field>
        <Field label="Allowed Account IDs" className="md:col-span-2">
          {data.allowedAccountIds
            ?.split(",")
            .map((id) => id.trim())
            .join(", ")}
        </Field>
        <Field label="STS Endpoint" className="md:col-span-2">
          {data.stsEndpoint}
        </Field>
      </div>

      <div>
        <Button variant="outline" size="xs" onClick={() => setShowStartCommand(true)}>
          Show start command
        </Button>
      </div>

      <AwsStartCommandDialog
        isOpen={showStartCommand}
        onOpenChange={setShowStartCommand}
        gatewayId={gatewayId}
        gatewayName={gatewayName}
      />
    </div>
  );
};
