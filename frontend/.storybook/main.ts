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
  },
  viteFinal: async (viteConfig) => {
    // The main app's vite.config.ts uses experimental.renderBuiltUrl to route
    // asset URLs through window.__toCdnUrl(...), a runtime function injected
    // by the standalone Docker deployment's serving layer. Storybook's static
    // deploy (e.g. Render) has no such injection, so strip the override and
    // let Vite emit plain relative URLs.
    const { renderBuiltUrl, ...experimental } = viteConfig.experimental ?? {};
    return {
      ...viteConfig,
      experimental
    };
  }
};
export default config;
