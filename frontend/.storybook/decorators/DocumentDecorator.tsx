import { useEffect } from "react";
import type { Decorator } from "@storybook/react-vite";

export const DocumentDecorator: Decorator = (Story) => {
  useEffect(() => {
    const root = document.getElementsByTagName("html")[0];

    root.setAttribute("class", "overflow-visible");
  }, []);

  return <Story />;
};
