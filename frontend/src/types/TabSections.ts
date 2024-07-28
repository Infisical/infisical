enum TabSections {
  Member = "members",
  Roles = "roles",
  Groups = "groups",
  Identities = "identities",
  ServiceTokens = "service-tokens"
}

const isTabSection = (value: any): boolean => {
  return Object.values(TabSections).includes(value);
}

export { TabSections, isTabSection }
