import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { bridgeQueryKeys } from "@app/hooks/api/bridge";
import { Timezone } from "@app/helpers/datetime";
import { BridgeRequestsTable } from "./BridgeDetailsPage/components/BridgeRequestsTable";

export const BridgeDetailsPage = () => {
  const bridgeId = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/projects/api-shield/$projectId/_api-shield-layout/bridge/$bridgeId",
    select: (el) => el.bridgeId
  });

  const { data: bridgeDetails, isPending } = useQuery({
    ...bridgeQueryKeys.byId(bridgeId),
    enabled: Boolean(bridgeId)
  });

  const { data: bridgeRequests, isPending: isRequestsLoading } = useQuery({
    ...bridgeQueryKeys.listRequest(bridgeId),
    enabled: Boolean(bridgeId)
  });

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>Bridge Details</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <PageHeader
            title={`Bridge: ${bridgeDetails?.slug}`}
            description="Detail insights into your projects"
          />
          <div className="mt-6">
            <h2 className="mb-4 text-xl font-semibold">Bridge Requests</h2>
            <BridgeRequestsTable
              bridgeRequests={bridgeRequests || []}
              isLoading={isRequestsLoading}
              timezone={Timezone.UTC}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/api-shield/$projectId/_api-shield-layout/bridge/$bridgeId"
)({
  component: BridgeDetailsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Bridge Details"
        }
      ]
    };
  }
});
