export enum TabSections {
  Member = "members",
  Groups = "groups",
  Roles = "roles",
  Identities = "identities"
}

export const isTabSection = (value: string): value is TabSections => {
  return (Object.values(TabSections) as string[]).includes(value);
};
