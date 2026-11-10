// A base class that copies a model's props onto the instance as read-only fields, so callers read
// `plan.rbac` and spreading or serialising the model gives its props. A model that extends it must not
// declare instance fields of its own: with useDefineForClassFields they would be reset after the copy.
export const withProps = <TProps extends object>() =>
  class {
    constructor(props: TProps) {
      Object.assign(this, props);
    }
  } as unknown as new (props: TProps) => Readonly<TProps>;
