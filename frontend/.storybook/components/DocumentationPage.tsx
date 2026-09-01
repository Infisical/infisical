import {
  Controls,
  Description,
  Primary,
  Stories,
  Subtitle,
  Title
} from "@storybook/addon-docs/blocks";
import { useParameter } from "storybook/preview-api";

import type { ComponentDeprecation } from "../deprecation";
import { DeprecationNotice } from "./DeprecationNotice";

const ComponentDeprecationNotice = () => {
  const deprecation = useParameter<ComponentDeprecation>("deprecation");

  return deprecation ? <DeprecationNotice className="mb-6" deprecation={deprecation} /> : null;
};

export const DocumentationPage = () => (
  <>
    <Title />
    <Subtitle />
    <ComponentDeprecationNotice />
    <Description />
    <Primary />
    <Controls />
    <Stories />
  </>
);
