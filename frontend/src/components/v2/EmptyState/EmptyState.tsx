import { ReactNode } from "react";
import { SizeProp } from "@fortawesome/fontawesome-svg-core";
import { faCubesStacked, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

type Props = {
  title: ReactNode;
  className?: string;
  children?: ReactNode;
  icon?: IconDefinition;
  iconSize?: SizeProp;
  titleClassName?: string;
};

export const EmptyState = ({
  title,
  className,
  children,
  icon = faCubesStacked,
  iconSize = "2x",
  titleClassName
}: Props) => (
  <div
    className={twMerge(
      "flex w-full flex-col items-center bg-container px-2 pt-4 text-label",
      className
    )}
  >
    <FontAwesomeIcon icon={icon} size={iconSize} />
    <div className="flex flex-col items-center py-4">
      <div className={twMerge("text-sm text-label", titleClassName)}>{title}</div>
      <div>{children}</div>
    </div>
  </div>
);
