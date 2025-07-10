import { Fragment } from "react";
import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, LinkProps } from "@tanstack/react-router";

import { Badge, Lottie, Tooltip } from "@app/components/v2";
import { BadgeProps } from "@app/components/v2/Badge/Badge";

type Props = {
  to: LinkProps["to"];
  lottie: string;
  title: string;
  badgeProps?: {
    variant: BadgeProps["variant"];
    label: string;
    tooltipContent: string;
    icon: IconDefinition;
  };
  items: {
    key: string;
    label: string;
  }[];
};

export const ProductCard = ({ to, items, title, badgeProps, lottie }: Props) => {
  return (
    <Link
      to={to}
      className="overflow-clip rounded border border-l-[4px] border-mineshaft-600 border-l-primary/75 bg-mineshaft-800 p-4 transition-transform duration-100 hover:scale-[103%] hover:border-l-primary hover:bg-mineshaft-700"
    >
      <div className="flex w-full items-center gap-3">
        <div className="rounded border border-mineshaft-500 bg-mineshaft-600 p-1.5 shadow-inner">
          <Lottie className="h-[1.75rem] w-[1.75rem] shrink-0" icon={lottie} />
        </div>
        <div className="-mt-0.5 flex w-full flex-col">
          <div className="flex w-full items-center">
            <span className="text-xl">{title}</span>
            {badgeProps && (
              <Tooltip className="max-w-sm" content={badgeProps.tooltipContent}>
                <div className="ml-auto">
                  <Badge className="mt-0.5 flex items-center gap-1.5" variant={badgeProps.variant}>
                    <FontAwesomeIcon className="text-yellow" icon={badgeProps.icon} />
                    <span>{badgeProps.label}</span>
                  </Badge>
                </div>
              </Tooltip>
            )}
          </div>
          <div className="-mt-0.5 flex items-center gap-2">
            {items.map((item) => (
              <Fragment key={item.key}>
                <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-mineshaft-300">
                  {item.label}
                </div>
                <span className="text-sm text-mineshaft-400 last:hidden">|</span>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
};
