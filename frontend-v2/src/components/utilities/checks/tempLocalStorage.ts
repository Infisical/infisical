// this is temporary util function. create error handling logic for localStorage and delete this.
export const tempLocalStorage = (key: string) => {
  const value = localStorage.getItem(key);

  if (value === null || value === "") {
    console.warn("No value found in localStorage for key");
    return "";
  }

  return value;
};
