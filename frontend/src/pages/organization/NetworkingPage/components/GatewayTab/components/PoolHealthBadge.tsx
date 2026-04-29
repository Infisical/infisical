import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";

export const PoolHealthBadge = ({ pool }: { pool: TGatewayPool }) => {
  if (pool.memberCount === 0) {
    return <span className="text-mineshaft-400">No members</span>;
  }
  let colorClass = "text-yellow-500";
  if (pool.healthyMemberCount === 0) {
    colorClass = "text-red-400";
  } else if (pool.healthyMemberCount === pool.memberCount) {
    colorClass = "text-green-500";
  }
  return (
    <span className={colorClass}>
      {pool.healthyMemberCount}/{pool.memberCount} healthy
    </span>
  );
};
