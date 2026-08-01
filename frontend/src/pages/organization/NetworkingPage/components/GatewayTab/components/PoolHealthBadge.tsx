import { Badge } from "@app/components/v3";
import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";

export const getPoolHealthBadgeVariant = ({
  memberCount,
  healthyMemberCount
}: Pick<TGatewayPool, "memberCount" | "healthyMemberCount">) => {
  if (memberCount === 0) return "neutral" as const;
  if (healthyMemberCount === 0) return "danger" as const;
  if (healthyMemberCount === memberCount) return "success" as const;
  return "warning" as const;
};

export const PoolHealthBadge = ({ pool }: { pool: TGatewayPool }) => {
  if (pool.memberCount === 0) {
    return <Badge variant="neutral">No members</Badge>;
  }
  return (
    <Badge variant={getPoolHealthBadgeVariant(pool)}>
      {pool.healthyMemberCount}/{pool.memberCount} healthy
    </Badge>
  );
};
