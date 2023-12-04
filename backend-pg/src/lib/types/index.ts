export type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

export type PickRequired<T> = Pick<T, RequiredKeys<T>>;
