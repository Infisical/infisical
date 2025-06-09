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
        "flex flex-col rounded-r border-l-2 border-l-primary bg-mineshaft-300/5 px-4 py-2.5",
        className
      )}
    >
      <div className={twMerge("mb-1 flex items-center text-sm", titleClassName)}>
        <FontAwesomeIcon icon={faInfoCircle} size="sm" className="mr-1.5 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
};
