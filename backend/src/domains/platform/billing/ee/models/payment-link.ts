// Links from the License Server are handed to the browser, so anything but a well-formed https URL is dropped.
export class PaymentLink {
  private constructor() {}

  static httpsOrNull(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return new URL(value).protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  }
}
