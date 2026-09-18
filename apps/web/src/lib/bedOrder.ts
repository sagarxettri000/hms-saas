export function bedNumberWeight(bedNumber: string): string {
  return String(bedNumber || '')
    .replace(/(\d+)/g, (m) => m.padStart(5, '0'))
    .toUpperCase();
}

export function byBed(b: any): string {
  return bedNumberWeight(b?.bedNumber || '');
}

export function wardName(b: any): string {
  return String(b?.ward?.name || b?.wardName || '');
}

export function compareBeds(a: any, b: any): number {
  const wc = wardName(a).localeCompare(wardName(b));
  if (wc !== 0) return wc;
  const numA = (a?.bedNumber || '').match(/(\d+)/);
  const numB = (b?.bedNumber || '').match(/(\d+)/);
  if (numA && numB) {
    const diff = Number(numA[1]) - Number(numB[1]);
    if (diff !== 0) return diff;
  }
  return byBed(a).localeCompare(byBed(b));
}
