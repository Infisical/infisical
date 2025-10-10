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
    <div className="border-mineshaft-500 bg-linear-to-br from-mineshaft-900 to-mineshaft-600 text-bunker-300 flex items-center rounded-md border px-16 py-12 text-center">
      <div>
        <div className="text-bunker-100 text-4xl font-medium">{title}</div>
        <div className="-mt-1 text-sm">{body}</div>
      </div>
    </div>
  );
};
