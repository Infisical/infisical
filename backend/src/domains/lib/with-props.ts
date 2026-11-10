// Copies a model's props onto the instance as read-only fields, so `plan.rbac` works and spreading or
// serialising gives the props. Subclasses can't declare their own fields: with useDefineForClassFields
// they'd get reset after the copy.
export const withProps = <TProps extends object>() =>
  class {
    constructor(props: TProps) {
      Object.assign(this, props);
    }
  } as unknown as new (props: TProps) => Readonly<TProps>;
