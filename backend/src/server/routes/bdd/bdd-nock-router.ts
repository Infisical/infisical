export const registerBddNockRouter = async () => {
  // This route is only available in development or test mode.
  // The actual implementation is in the dev.ts file and will be aliased to that file in development or test mode.
  // And if somehow we try to enable it in production, we will throw an error.
  throw new Error("BDD Nock should not be enabled in production");
};
