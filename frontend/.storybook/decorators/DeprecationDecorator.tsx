import type { Decorator } from "@storybook/react-vite";

import { DeprecationNotice } from "../components/DeprecationNotice";
import type { ComponentDeprecation } from "../deprecation";

export const DeprecationDecorator: Decorator = (Story, context) => {
  const { parameters, viewMode } = context;
  const deprecation = parameters.deprecation as ComponentDeprecation | undefined;

  if (!deprecation || viewMode !== "story") return <Story />;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <DeprecationNotice deprecation={deprecation} />
      <Story />
    </div>
  );
};
