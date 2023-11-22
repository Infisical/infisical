export const publicPaths = [
  "/",
  // `/integrations`,
  "/signupinvite",
  "/pricing",
  "/signup",
  "/signup/sso",
  "/login",
  "/blog",
  "/docs",
  "/changelog",
  "/security",
  "/scheduledemo",
  "/blog/[slug]",
  "/faq",
  "/privacy",
  "/terms",
  "/subprocessors",
  "/verify-email",
  "/password-reset",
  "/saml-sso",
  "/login/provider/success", // TODO: change
  "/login/provider/error", // TODO: change
  "/login/sso",
  "/admin/signup"
];

export const languageMap = {
  en: "English",
  ko: "한국어",
  fr: "Français"
};

interface Mapping {
  [key: string]: string;
}

const plansDev: Mapping = {
  starter: "prod_Nt6kPvYsVBuzVH",
  team: "prod_NEpD2WMXUS2eDn",
  professional: "prod_Mb4CetZ2jE7jdl",
  enterprise: "licence_key_required"
};

const plansProd: Mapping = {
  starter: "prod_Mb8oR5XNwyFTul",
  team: "prod_NEp7fAB3UJWK6A",
  professional: "prod_Mb8pUIpA0OUi5N",
  enterprise: "licence_key_required"
};

export const plans = plansProd || plansDev;

export const leaveConfirmDefaultMessage =
  "Your changes will be lost if you leave the page. Are you sure you want to continue?";

export const secretTagsColors = [
  {
    id: 1,
    hex: "#bec2c8",
    rgba: "rgb(128,128,128, 0.8)",
    name: "Grey",
    selected: true
  },
  {
    id: 2,
    hex: "#95a2b3",
    rgba: "rgb(0,0,255, 0.8)",
    name: "blue",
    selected: false
  },
  {
    id: 3,
    hex: "#5e6ad2",
    rgba: "rgb(128,0,128, 0.8)",
    name: "Purple",
    selected: false
  },
  {
    id: 4,
    hex: "#26b5ce",
    rgba: "rgb(0,128,128, 0.8)",
    name: "Teal",
    selected: false
  },
  {
    id: 5,
    hex: "#4cb782",
    rgba: "rgb(0,128,0, 0.8)",
    name: "Green",
    selected: false
  },
  {
    id: 6,
    hex: "#f2c94c",
    rgba: "rgb(255,255,0, 0.8)",
    name: "Yellow",
    selected: false
  },
  {
    id: 7,
    hex: "#f2994a",
    rgba: "rgb(128,128,0, 0.8)",
    name: "Orange",
    selected: false
  },
  {
    id: 8,
    hex: "#f7c8c1",
    rgba: "rgb(128,0,0, 0.8)",
    name: "Pink",
    selected: false
  },
  {
    id: 9,
    hex: "#eb5757",
    rgba: "rgb(255,0,0, 0.8)",
    name: "Red",
    selected: false
  }
];
