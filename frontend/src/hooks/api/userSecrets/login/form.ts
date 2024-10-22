export const LoginUserSecretForm = {
  fields: [
    {
      name: "username",
      label: "Username",
      type: "text"
    },
    {
      name: "password",
      label: "Password",
      type: "password"
    },
    {
      name: "websites",
      label: "Websites",
      type: "url",
      isArray: true
    }
  ]
};
