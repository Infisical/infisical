declare module "ldif" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped, the function returns `any`.
  function parse(input: string, ...args: any[]): any;
}
