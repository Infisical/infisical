import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

type Props = { children?: ReactNode };

export const AuthPageHeader = ({ children }: Props) => (
  <header className="relative z-10 flex w-full items-center justify-between pt-4">
    <Link to="/">
      <img alt="Infisical" src="/images/logotransparent.png" className="h-5" />
    </Link>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </header>
);
