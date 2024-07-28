enum TabSections {
  Member = "members",
  Roles = "roles",
  Groups = "groups",
  Identities = "identities",
  ServiceTokens = "service-tokens"
}

const isTabSection = (value: any): value is TabSections => {
  return Object.values(TabSections).includes(value);
}

export { TabSections, isTabSection }
