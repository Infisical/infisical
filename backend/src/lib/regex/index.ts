export const DistinguishedNameRegex =
  // DN format, ie; CN=user,OU=users,DC=example,DC=com
  /^(?:(?:[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)(?:(?:\\+[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)*)(?:,(?:[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)(?:(?:\\+[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)*))*)?$/;

export const UserPrincipalNameRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
