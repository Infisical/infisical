export enum TabSections {
  Member = "members",
  Roles = "roles",
  Identities = "identities"
}

export const isTabSection = (value: string): value is TabSections => {
  return (Object.values(TabSections) as string[]).includes(value);
}
