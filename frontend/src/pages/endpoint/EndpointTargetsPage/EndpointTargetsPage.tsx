import { Helmet } from "react-helmet";
import { InfoIcon, NetworkIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

export const EndpointTargetsPage = () => {
  return (
    <>
      <Helmet>
        <title>Endpoint Targets</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.Endpoint}
          title="Targets"
          description="Private network resources devices can reach through Endpoint."
        />

        <Card>
          <CardHeader>
            <CardTitle>Private Access Targets</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert variant="info">
              <InfoIcon />
              <AlertTitle>Coming soon</AlertTitle>
              <AlertDescription>
                Targets will let you publish an internal host or service and grant registered
                devices private access to it without a VPN. Creating targets is not available yet.
              </AlertDescription>
            </Alert>
            <Empty className="border">
              <EmptyMedia variant="icon">
                <NetworkIcon />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No targets configured</EmptyTitle>
                <EmptyDescription>
                  Private access targets will appear here once this capability ships.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    </>
  );
};
