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
};

export const EmptyState = ({
  title,
  className,
  children,
  icon = faCubesStacked,
  iconSize = "2x"
}: Props) => (
  <div
    className={twMerge(
      "flex w-full flex-col items-center bg-mineshaft-800 px-2 pt-6 text-bunker-300",
      className
    )}
  >
    <FontAwesomeIcon icon={icon} size={iconSize} />
    <div className="flex flex-col items-center py-4">
      <div className="text-sm text-bunker-300">{title}</div>
      <div>{children}</div>
    </div>
  </div>
);
