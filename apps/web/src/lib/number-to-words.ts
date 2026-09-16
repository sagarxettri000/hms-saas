const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o ? ' ' + ones[o] : '');
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ones[h] + ' Hundred');
  if (r) parts.push(twoDigits(r));
  return parts.join(' and ');
}

export function numberToWordsInt(n: number): string {
  if (n === 0) return 'Zero';
  if (n < 0) return 'Minus ' + numberToWordsInt(-n);
  const trillions = Math.floor(n / 1000000000000000);
  const billions = Math.floor((n % 1000000000000000) / 1000000000);
  const millions = Math.floor((n % 1000000000) / 1000000);
  const thousands = Math.floor((n % 1000000) / 1000);
  const remainder = n % 1000;
  const parts: string[] = [];
  if (trillions) parts.push(threeDigits(trillions) + ' Trillion');
  if (billions) parts.push(threeDigits(billions) + ' Billion');
  if (millions) parts.push(threeDigits(millions) + ' Million');
  if (thousands) parts.push(threeDigits(thousands) + ' Thousand');
  if (remainder) parts.push(threeDigits(remainder));
  return parts.join(', ');
}

function paisaPart(paise: number): string {
  if (paise === 0) return '';
  return ' and ' + twoDigits(paise) + ' Paisa';
}

export function amountInWords(amount: unknown, currency = 'NPR'): string {
  const n = Number(amount);
  if (!isFinite(n) || n <= 0) return '';
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  const intPart = numberToWordsInt(rupees);
  const sub = paisaPart(paise);
  return `${currency} ${intPart}${sub} Only`;
}
