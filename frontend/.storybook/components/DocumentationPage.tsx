import {
  Controls,
  Description,
  Primary,
  Stories,
  Subtitle,
  Title,
  useOf
} from "@storybook/addon-docs/blocks";

import type { ComponentDeprecation } from "../deprecation";
import { DeprecationNotice } from "./DeprecationNotice";

const ComponentDeprecationNotice = () => {
  const { preparedMeta } = useOf("meta", ["meta"]);
  const deprecation = preparedMeta.parameters.deprecation as ComponentDeprecation | undefined;

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
