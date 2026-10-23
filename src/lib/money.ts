/** All money is an integer number of rupiah. There are no decimals anywhere. */

export function assertRupiah(value: number, label = 'amount'): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of rupiah, got ${value}`);
  }
  return value;
}

/** 12500 -> "Rp 12.500". Negative values keep the sign in front. */
export function formatRupiah(value: number): string {
  assertRupiah(value);
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${digits}`;
}

/** Parses what a person types into a cash field: "50.000", "50000", "Rp 50 000". Returns 0 for junk. */
export function parseRupiah(input: string): number {
  const digits = input.replace(/\D/g, '');
  if (digits === '') return 0;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : 0;
}
