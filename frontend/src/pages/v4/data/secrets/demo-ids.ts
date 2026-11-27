export const demoConnectionId = (name: string) => {
  const hash = Array.from(name)
    .reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 0xffffffff, 7)
    .toString(16)
    .padStart(8, "0");
  return `${hash}-0000-4000-8000-${hash}0000`;
};
