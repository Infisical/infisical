import { ReactNode } from "react";

type Props = {
  title?: string;
  body?: ReactNode;
};

export const AccessRestrictedBanner = ({
  title = "Access Restricted",

  body = (
    <>
      Your current role doesn&#39;t provide access to this feature.
      <br /> Contact your administrator to request access.
    </>
  )
}: Props) => {
  return (
    <div className="flex items-center rounded-md border border-mineshaft-500 bg-gradient-to-br from-mineshaft-900 to-mineshaft-600 px-16 py-12 text-center text-bunker-300">
      <div>
        <div className="text-4xl font-medium text-bunker-100">{title}</div>
        <div className="-mt-1 text-sm">{body}</div>
      </div>
    </div>
  );
};
