export const TabTypes = {
  WebLogin: "web_login",
  CreditCard: "credit_card",
  SecureNote: "secure_note"
} as const;

export type TabsValue = typeof TabTypes[keyof typeof TabTypes];

export type State = {
  activeTab: TabsValue
};
