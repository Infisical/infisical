declare module "hdb" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped, the function returns `any`.
  function createClient(options): any;
}
