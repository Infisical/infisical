export const validateOrganizationName = (name: string) => {
  if (!name) {
    return "Please enter your organization name";
  }

  if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
    return "Organization name can only contain alphanumeric characters, dashes, and spaces";
  }

  return null
}
