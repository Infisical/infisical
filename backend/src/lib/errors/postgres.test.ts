import { DatabaseErrorCode } from "@app/lib/error-codes";

import { DatabaseError } from "./index";
import { hasPostgresConstraintViolation, hasPostgresErrorCode } from "./postgres";

describe("hasPostgresConstraintViolation", () => {
  const foreignKeyViolation = (constraint: string) =>
    new DatabaseError({
      name: "Insert rows",
      error: Object.assign(new Error("violates foreign key constraint"), {
        code: DatabaseErrorCode.ForeignKeyViolation,
        constraint
      })
    });

  test("finds the constraint under the DatabaseError a DAL wraps the driver error in", () => {
    const err = foreignKeyViolation("orders_customerid_foreign");
    expect(hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)).toBe(true);
    expect(
      hasPostgresConstraintViolation(err, DatabaseErrorCode.ForeignKeyViolation, "orders_customerid_foreign")
    ).toBe(true);
  });

  test("tells one foreign key from another", () => {
    expect(
      hasPostgresConstraintViolation(
        foreignKeyViolation("orders_customerid_foreign"),
        DatabaseErrorCode.ForeignKeyViolation,
        "orders_productid_foreign"
      )
    ).toBe(false);
  });

  test("matches only under the code asked for", () => {
    expect(
      hasPostgresConstraintViolation(
        foreignKeyViolation("orders_customerid_foreign"),
        DatabaseErrorCode.UniqueViolation,
        "orders_customerid_foreign"
      )
    ).toBe(false);
  });
});
