import { ReactNode } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
};

export const NoticeBannerV2 = ({ title, children, className, titleClassName }: Props) => {
  return (
    <div
      className={twMerge(
        "border-l-primary bg-mineshaft-300/5 flex flex-col rounded-r border-l-2 px-4 py-2.5",
        className
      )}
    >
      <div className={twMerge("mb-1 flex items-center text-sm", titleClassName)}>
        <FontAwesomeIcon icon={faInfoCircle} size="sm" className="text-primary mr-1.5" />
        {title}
      </div>
      {children}
    </div>
  );
};
