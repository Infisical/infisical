import { themes } from '@storybook/theming';
import '../src/styles/globals.css';

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/
    }
  },
  darkMode: {
    dark: { ...themes.dark, appContentBg: 'rgb(14,16,20)', appBg: 'rgb(14,16,20)' }
  }
};
