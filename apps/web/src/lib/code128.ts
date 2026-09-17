/**
 * Code128-B barcode geometry for the browser — mirrors
 * `apps/server/src/modules/billing/code128.ts` so receipts render the same
 * scannable bars the printed PDF carries. The value shown is the invoice's
 * server-assigned `barcode` (its invoice number). Bar/space alternation
 * restarts with a bar at each symbol boundary per the Code128 spec.
 */

const PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

/**
 * Ordered bar/space widths (modules) for a value, or null if unencodable.
 * Even indices are bars, odd are spaces — restarting per symbol.
 */
export function code128Runs(value: string): number[] | null {
  if (!/^[ -~]+$/.test(value) || value.length === 0) return null;
  const symbols: number[] = [104]; // Start B
  let checksum = 104;
  for (let i = 0; i < value.length; i++) {
    const v = value.charCodeAt(i) - 32;
    symbols.push(v);
    checksum += v * (i + 1);
  }
  symbols.push(checksum % 103);
  symbols.push(106); // Stop
  const runs: number[] = [];
  for (const s of symbols) {
    for (const ch of PATTERNS[s]) runs.push(Number(ch));
  }
  return runs;
}
