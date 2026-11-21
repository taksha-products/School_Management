/**
 * Strips a phone number down to digits only.
 */
export const digitsOnly = (value: string): string => value.replace(/\D/g, "");

/**
 * Normalizes an Indian mobile number to a 10-digit local form (no country code).
 * Accepts inputs like `9876543210`, `+91 98765 43210`, `919876543210`.
 * Returns null when the number is not a valid Indian mobile.
 */
export const normalizeIndianMobile = (raw: string | undefined | null): string | null => {
  if (!raw) {
    return null;
  }

  let digits = digitsOnly(raw);

  if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }

  return digits;
};

/**
 * Formats a stored 10-digit Indian mobile for SMS providers (E.164).
 */
export const toE164IndianMobile = (tenDigit: string): string => `+91${tenDigit}`;
