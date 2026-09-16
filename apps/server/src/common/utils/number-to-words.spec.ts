import { amountInWords, numberToWords, numberToWordsInt } from "./number-to-words";

describe("numberToWordsInt", () => {
  it("converts 0 and small numbers", () => {
    expect(numberToWordsInt(0)).toBe("Zero");
    expect(numberToWordsInt(1)).toBe("One");
    expect(numberToWordsInt(17)).toBe("Seventeen");
    expect(numberToWordsInt(42)).toBe("Forty Two");
    expect(numberToWordsInt(100)).toBe("One Hundred");
    expect(numberToWordsInt(105)).toBe("One Hundred Five");
    expect(numberToWordsInt(1015)).toBe("One Thousand Fifteen");
    expect(numberToWordsInt(1500)).toBe("One Thousand Five Hundred");
  });

  it("converts grouped magnitudes", () => {
    expect(numberToWordsInt(1000000)).toBe("One Million");
    expect(numberToWordsInt(2500000)).toBe("Two Million Five Hundred Thousand");
    expect(numberToWordsInt(130000)).toBe("One Hundred Thirty Thousand");
  });

  it("handles negatives and invalid input with empty string", () => {
    expect(numberToWordsInt(-1)).toBe("");
    expect(numberToWordsInt(NaN)).toBe("");
  });
});

describe("numberToWords (decimal amount)", () => {
  it("returns integer words with Only suffix for whole amounts", () => {
    expect(numberToWords(1000)).toBe("One Thousand Only");
    expect(numberToWords("1000")).toBe("One Thousand Only");
  });

  it("splits rupees and paisa from decimal strings", () => {
    expect(numberToWords("13000.75")).toBe("Thirteen Thousand and Seventy Five Paisa Only");
    expect(numberToWords("1.05")).toBe("One and Five Paisa Only");
  });

  it("rejects malformed input", () => {
    expect(numberToWords("abc")).toBe("");
    expect(numberToWords("1.2.3")).toBe("");
  });
});

describe("amountInWords", () => {
  it("formats amount in words with currency and paisa", () => {
    expect(amountInWords(13000.75, "NPR")).toBe(
      "NPR Thirteen Thousand and Seventy Five Paisa Only",
    );
    expect(amountInWords(500, "NPR")).toBe("NPR Five Hundred Only");
  });

  it("returns empty string for invalid input", () => {
    expect(amountInWords("abc")).toBe("");
  });
});