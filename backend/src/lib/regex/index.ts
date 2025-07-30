import RE2 from "re2";

export const DistinguishedNameRegex =
  // DN format, ie; CN=user,OU=users,DC=example,DC=com
  new RE2(
    /^(?:(?:[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)(?:(?:\\+[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)*)(?:,(?:[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)(?:(?:\\+[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)*))*)?$/
  );

export const UserPrincipalNameRegex = new RE2(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/);

export const LdapUrlRegex = new RE2(/^ldaps?:\/\//);

export const BasicRepositoryRegex = new RE2(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/);

export const GitLabProjectRegex = new RE2(/^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)+$/);
