import { NodeProps } from "@xyflow/react";
import { BoxIcon } from "lucide-react";

export type ProjectGroupNodeData = {
  projectName: string;
};

export const ProjectGroupNode = ({ data }: NodeProps & { data: ProjectGroupNodeData }) => {
  const { projectName } = data;

  return (
    <div className="h-full w-full rounded-md border border-info/30 bg-info/5 p-2 pt-0">
      <div className="mb-1 flex items-center gap-1 rounded-b-sm bg-info/10 px-2 py-0.5 text-[10px] text-info">
        <BoxIcon className="size-3" />
        <span className="font-medium">{projectName}</span>
      </div>
    </div>
  );
};
