const base64WithPadding =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;

export const isBase64 = (str: string): boolean => {
  if (typeof str !== "string") {
    throw new TypeError("Expected a string");
  }

  if (str === "") return true;

  const regex = base64WithPadding;

  return regex.test(str);
};
