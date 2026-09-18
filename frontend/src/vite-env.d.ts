/// <reference types="vite/client" />
//
interface ImportMetaEnv {
  readonly VITE_INTERCOM_ID?: string;
  readonly VITE_CAPTCHA_SITE_KEY?: string;
  readonly VITE_INFISICAL_PLATFORM_VERSION?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
