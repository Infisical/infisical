import { HTMLAttributes } from "react";
import { GripHorizontalIcon } from "lucide-react";

type Props = {
  title: string;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
};

export const AnnotationPopoverHeader = ({ title, dragHandleProps }: Props) => {
  if (!dragHandleProps) return <p className="text-sm font-medium">{title}</p>;

  return (
    <div
      {...dragHandleProps}
      role="button"
      tabIndex={0}
      aria-label={`Move ${title.toLowerCase()} (drag or use arrow keys)`}
      className="-mx-4 -mt-4 flex cursor-grab touch-none items-center justify-between rounded-t-lg px-4 pt-4 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <p className="text-sm font-medium">{title}</p>
      <GripHorizontalIcon className="size-4 text-accent" />
    </div>
  );
};
