export enum TabSections {
  Member = "members",
  Roles = "roles",
  Groups = "groups",
  Identities = "identities",
  ServiceTokens = "service-tokens"
}

export const isTabSection = (value: string): value is TabSections => {
  return (Object.values(TabSections) as string[]).includes(value);
}
