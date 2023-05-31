export const publicPaths = [
  `/`,
  // `/integrations`,
  `/signupinvite`,
  `/pricing`,
  `/signup`,
  `/login`,
  `/blog`,
  `/docs`,
  `/changelog`,
  `/security`,
  `/scheduledemo`,
  `/blog/[slug]`,
  `/faq`,
  `/privacy`,
  `/terms`,
  `/subprocessors`,
  `/verify-email`,
  `/password-reset`
];

export const languageMap = {
  en: 'English',
  ko: '한국어',
  fr: 'Français'
};

interface Mapping {
  [key: string]: string;
}

const plansDev: Mapping = {
  starter: 'prod_Nt6kPvYsVBuzVH',
  team: 'prod_NEpD2WMXUS2eDn',
  professional: 'prod_Mb4CetZ2jE7jdl',
  enterprise: 'licence_key_required'
};

const plansProd: Mapping = {
  starter: 'prod_Mb8oR5XNwyFTul',
  team: 'prod_NEp7fAB3UJWK6A',
  professional: 'prod_Mb8pUIpA0OUi5N',
  enterprise: 'licence_key_required'
};

export const plans = plansProd || plansDev;

export const leaveConfirmDefaultMessage = 'Your changes will be lost if you leave the page. Are you sure you want to continue?';
