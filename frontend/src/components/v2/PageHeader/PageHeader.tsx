import { ReactNode } from "@tanstack/react-router";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
};

export const PageHeader = ({ title, description, children }: Props) => (
  <div className="mb-4">
    <div className="flex w-full justify-between">
      <div>
        <h1 className="mr-4 text-3xl font-semibold capitalize text-white">{title}</h1>
      </div>
      <div>{children}</div>
    </div>
    <div className="mt-2 text-gray-400">{description}</div>
  </div>
);
