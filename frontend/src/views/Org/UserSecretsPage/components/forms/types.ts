export type FormProps<T> = {
  userId: string;
  onSubmit: () => void;
  defaultValues?: T;
};
