import { PaymentLink } from "./payment-link";

describe("PaymentLink.httpsOrNull", () => {
  test("should keep a well-formed https link", () => {
    // Setup
    const link = "https://invoice.stripe.com/i/acct_1/abc";

    // Action
    const result = PaymentLink.httpsOrNull(link);

    // Assert
    expect(result).toBe(link);
  });

  test.each(["http://invoice.stripe.com/i/abc", "ftp://files.example/pay", "not a url", "", null, undefined])(
    "should drop %s",
    (link) => {
      // Setup
      const input = link;

      // Action
      const result = PaymentLink.httpsOrNull(input);

      // Assert
      expect(result).toBeNull();
    }
  );
});
