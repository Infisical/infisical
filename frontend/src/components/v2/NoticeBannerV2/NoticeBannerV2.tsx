import { ReactNode } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Props = {
  title: string;
  children: ReactNode;
};

export const NoticeBannerV2 = ({ title, children }: Props) => {
  return (
    <div className="flex flex-col rounded-r border-l-2 border-l-primary bg-mineshaft-300/5 px-4 py-2.5">
      <div className="mb-1 flex items-center text-sm">
        <FontAwesomeIcon icon={faInfoCircle} size="sm" className="mr-1.5 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
};
