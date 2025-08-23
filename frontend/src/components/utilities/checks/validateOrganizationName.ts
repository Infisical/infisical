export const validateOrganizationName = (name: string) => {
  if (!name) {
    return "Please enter your organization name";
  }

  if (!/^[a-zA-Z0-9\s\-_\s]+$/.test(name)) {
    return "Organization name can only contain alphanumeric characters, underscores, dashes and spaces";
  }

  return null
}
