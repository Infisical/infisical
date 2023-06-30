const path = require('path');
module.exports = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    'storybook-dark-mode',
    {
      name: '@storybook/addon-styling',
      options: {
        postCss: {
          implementation: require('postcss')
        }
      }
    }
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {}
  },
  core: {
    disableTelemetry: true
  },
  docs: {
    autodocs: 'tag'
  }
};
