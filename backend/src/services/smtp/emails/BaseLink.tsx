import { Link } from "@react-email/components";
import React from "react";

type Props = {
  href: string;
  children: string;
};

export const BaseLink = ({ href, children }: Props) => {
  return (
    <Link href={href} className="text-slate-700 underline decoration-slate-700">
      {children}
    </Link>
  );
};
