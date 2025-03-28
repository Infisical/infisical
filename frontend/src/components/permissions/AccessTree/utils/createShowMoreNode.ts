import { ProjectPermissionSub } from "@app/context";

import { PermissionNode } from "../types";

export const createShowMoreNode = ({
  parentId,
  onClick,
  remaining,
  subject
}: {
  parentId: string | null;
  onClick: () => void;
  remaining: number;
  subject: ProjectPermissionSub;
}) => {
  let height: number;

  switch (subject) {
    case ProjectPermissionSub.DynamicSecrets:
      height = 130;
      break;
    case ProjectPermissionSub.Secrets:
      height = 85;
      break;
    default:
      height = 64;
  }
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
    width: 150,
    height,
    style: {
      background: "transparent",
      border: "none"
    }
  };
};
