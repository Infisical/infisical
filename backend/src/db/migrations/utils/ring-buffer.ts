export const createCircularCache = <T>(bufferSize = 10) => {
  const bufferItems: { id: string; item: T }[] = [];
  let bufferIndex = 0;

  const push = (id: string, item: T) => {
    if (bufferItems.length < bufferSize) {
      bufferItems.push({ id, item });
    } else {
      bufferItems[bufferIndex] = { id, item };
    }
    bufferIndex = (bufferIndex + 1) % bufferSize;
  };

  const getItem = (id: string) => {
    return bufferItems.find((i) => i.id === id)?.item;
  };

  return { push, getItem };
};
