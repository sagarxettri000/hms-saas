const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

const isWhole = (n: number): boolean =>
  Number.isFinite(n) && Math.floor(Math.abs(n)) === Math.abs(n);

/** Converts a non-negative integer to English words, e.g. 13456 -> "Thirteen Thousand Four Hundred Fifty-Six". */
export function numberToWordsInt(num: number): string {
  if (!Number.isFinite(num) || num < 0) return "";
  if (num === 0) return "Zero";

  const chunks: number[] = [];
  let value = Math.floor(num);
  while (value > 0) {
    chunks.push(value % 1000);
    value = Math.floor(value / 1000);
  }

  const parts: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (chunk === 0) continue;
    const chunkWords = threeDigits(chunk);
    parts.push(chunkWords + (i > 0 ? " " + SCALES[i] : ""));
  }
  return parts.join(" ");
}

function threeDigits(num: number): string {
  const hundreds = Math.floor(num / 100);
  const remainder = num % 100;
  const words: string[] = [];
  if (hundreds > 0) words.push(`${ONES[hundreds]} Hundred`);
  if (remainder > 0) {
    if (remainder < 20) {
      words.push(ONES[remainder]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      words.push(TENS[tens] + (ones > 0 ? " " + ONES[ones] : ""));
    }
  }
  return words.join(" ");
}

/**
 * Converts a currency amount (rupees + paisa) to words suitable for official documents.
 * Supports both numeric input and "1234.56" style strings with up to two decimal places.
 */
export function numberToWords(input: number | string): string {
  let clean: string;
  if (typeof input === "string") {
    clean = input.trim();
  } else if (Number.isFinite(input)) {
    clean = String(Math.abs(input));
  } else {
    return "";
  }

  if (!/^\d+(\.\d+)?$/.test(clean)) return "";

  let rupees = 0;
  let paisa = 0;
  if (isWhole(Number(clean))) {
    rupees = Number(clean);
  } else {
    const [whole, frac] = clean.split(".");
    rupees = Number(whole || "0");
    paisa = Number((frac || "").padEnd(2, "0").slice(0, 2));
  }

  const rupeesWords = numberToWordsInt(rupees);
  const paisaWords = paisa > 0 ? numberToWordsInt(paisa) : "";

  if (paisaWords) {
    return `${rupeesWords} and ${paisaWords} Paisa Only`;
  }
  return `${rupeesWords} Only`;
}

/**
 * Formats an amount in words prefixed with the currency code,
 * e.g. "NPR Thirteen Thousand Four Hundred Fifty-Six and Seventy-Five Paisa Only".
 */
export function amountInWords(
  amount: number | string,
  currency = "NPR",
): string {
  const words = numberToWords(amount);
  return words ? `${currency} ${words}` : "";
}
