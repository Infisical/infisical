import { useNavigate } from "@tanstack/react-router";

import { Button } from "../v2";

interface IProps {
  projectId: string;
}

export const NoEnvironmentsBanner = ({ projectId }: IProps) => {
  const navigate = useNavigate();

  return (
    <div className="mt-4 flex w-full flex-row items-center rounded-md border border-primary-600/70 bg-primary/[.07] p-4 text-base text-white">
      <div className="flex w-full flex-col text-sm">
        <span className="mb-2 text-lg font-semibold">
          No environments in your project was found
        </span>
        <p className="prose">
          In order to use integrations, you need to create at least one environment in your project.
        </p>
      </div>
      <div className="my-2">
        <Button onClick={() => navigate({ to: `/project/${projectId}/settings#environments` })}>
          Add environments
        </Button>
      </div>
    </div>
  );
};
