export const hasEnvironmentCapacity = (
  environmentLimit: number | null | undefined,
  environmentCount: number
) => !environmentLimit || environmentCount < environmentLimit;
