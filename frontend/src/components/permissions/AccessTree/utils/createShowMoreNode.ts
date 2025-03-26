import { PermissionNode } from "../types";

export const createShowMoreNode = ({
  parentId,
  onClick,
  remaining
}: {
  parentId: string | null;
  onClick: () => void;
  remaining: number;
}) => {
  const id = `show-more-${parentId || "root"}`;
  return {
    id,
    type: PermissionNode.ShowMoreButton,
    position: { x: 0, y: 0 },
    data: {
      parentId,
      onClick,
      remaining
    },
    width: 100,
    height: 40
  };
};
