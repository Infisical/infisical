import { Badge } from "@app/components/v3";
import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";

export const PoolHealthBadge = ({ pool }: { pool: TGatewayPool }) => {
  if (pool.memberCount === 0) {
    return <Badge variant="neutral">No members</Badge>;
  }
  let variant: "warning" | "danger" | "success" = "warning";
  if (pool.healthyMemberCount === 0) {
    variant = "danger";
  } else if (pool.healthyMemberCount === pool.memberCount) {
    variant = "success";
  }
  return (
    <Badge variant={variant}>
      {pool.healthyMemberCount}/{pool.memberCount} healthy
    </Badge>
  );
};
