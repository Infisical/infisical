import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: [
    "../src/components/v3/**/*.mdx",
    "../src/components/v3/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {}
  }
};
export default config;
