import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type Props = {
  label: string;
  children?: ReactNode;
  className?: string;
  labelClassName?: string;
  truncate?: boolean;
  icon?: LucideIcon;
};

export const ReviewField = ({
  label,
  children,
  className,
  labelClassName,
  truncate,
  icon: Icon
}: Props) => {
  const hasValue =
    children !== null && children !== undefined && children !== "" && children !== false;

  return (
    <Detail className={cn("min-w-0", className)}>
      <DetailLabel className={cn("flex items-center gap-1.5", labelClassName)}>
        {Icon ? <Icon className="size-3.5 text-muted" /> : null}
        {label}
      </DetailLabel>
      {hasValue ? (
        <DetailValue className={truncate ? "truncate" : undefined}>{children}</DetailValue>
      ) : (
        <DetailValue className="text-muted italic">None</DetailValue>
      )}
    </Detail>
  );
};
