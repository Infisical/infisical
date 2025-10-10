import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface HeaderProps {
  children: ReactNode;
  className?: string;
}

function Header({ children, className }: HeaderProps) {
  return (
    <header
      className={twMerge(
        "flex h-[calc(var(--header-height))] w-screen min-w-fit flex-col border-b-2 border-border bg-header px-5 pt-5",
        className
      )}
    >
      {children}
    </header>
  );
}

export { Header, type HeaderProps };
