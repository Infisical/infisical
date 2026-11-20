import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { ShareBar } from "@infisical/cipher/ui/share-bar";
import { Skeleton } from "@infisical/cipher/ui/skeleton";

import { useV4Adapter } from "../../data/adapters";

const formatRequests = (count: number) =>
  `${count.toLocaleString()} ${count === 1 ? "request" : "requests"}`;

export const AuthMethodCard = ({ projectId }: { projectId: string }) => {
  const { data, isPending } = useV4Adapter("secretInsights").useAuthMethodDistribution({
    projectId,
    days: 30
  });
  const methods = data?.methods ?? [];

  let body;
  if (isPending) body = <Skeleton height={160} />;
  else if (methods.length === 0)
    body = <EmptyState size="sm" icon="key" title="No secret reads in the past 30 days" />;
  else
    body = (
      <ShareBar
        label="Authentication methods"
        format={formatRequests}
        items={[...methods]
          .sort((a, b) => b.count - a.count)
          .map((method) => ({
            id: method.method,
            label: method.method,
            value: method.count
          }))}
      />
    );

  return (
    <Card title="Authentication Methods" description="Past 30 days">
      {body}
    </Card>
  );
};
