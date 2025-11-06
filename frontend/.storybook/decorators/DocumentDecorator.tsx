import { useEffect } from "react";
import type { Decorator } from "@storybook/react-vite";

export const DocumentDecorator: Decorator = (Story) => {
  useEffect(() => {
    const root = document.documentElement;

    root.setAttribute("class", "overflow-visible");
  }, []);

  return <Story />;
};
