import { ReactNode } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export const PageHeader = ({ title, description, children, className }: Props) => (
  <div className={twMerge("mb-4 w-full", className)}>
    <div className="flex w-full justify-between">
      <div className="w-full">
        <h1 className="mr-4 text-3xl font-semibold capitalize text-white">{title}</h1>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
    <div className="mt-2 text-gray-400">{description}</div>
  </div>
);
