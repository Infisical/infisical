import { ReactNode } from "react";
import { faWarning, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

type Props = {
  icon?: IconDefinition;
  title: string;
  children: ReactNode;
  className?: string;
};

export const NoticeBanner = ({ icon = faWarning, title, children, className }: Props) => (
  <div
    className={twMerge(
      "flex w-full flex-row items-center rounded-md border border-primary-600/70 bg-primary/[.07] p-4 text-base text-white",
      className
    )}
  >
    <FontAwesomeIcon icon={icon} className="pr-6 text-4xl text-white/80" />
    <div className="flex w-full flex-col text-sm">
      <div className="mb-2 text-lg font-semibold">{title}</div>
      <div>{children}</div>
    </div>
  </div>
);
