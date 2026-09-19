import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

/**
 * Bilingual (English/नेपाली) document terminology engine (§72).
 *
 * Translation is DISPLAY-ONLY: structured clinical/financial values are
 * never altered or stored here (§72.6). Medication safety-critical fields
 * are preserved verbatim from the structured prescription (§72.2) — the
 * dictionary localizes presentation text, never dosage math.
 */

export interface StructuredMedicationInstruction {
  medicineName: string;
  strength?: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  timing?: string;
  specialInstructions?: string;
  beforeFood?: boolean;
  afterFood?: boolean;
  prn?: boolean;
  dispensingInfo?: string;
}

export interface BilingualReceiptLine {
  label: string;
  labelNe?: string;
  amount: number;
  quantity?: number;
}

export interface BilingualReceiptInput {
  receiptNumber: string;
  dateTime: Date;
  facilityName: string;
  facilityNameNe?: string;
  cashier?: string;
  paymentMethod?: string;
  patientName?: string;
  lines: BilingualReceiptLine[];
  total: number;
  currency?: string;
  barcodeValue?: string;
  thermalWidthColumns?: number;
}

@Injectable()
export class BilingualService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  /** Upsert a dictionary term — versioned, never destructive (§72.3). */
  async upsertTerm(
    tenantId: string,
    data: { domain: string; sourceText: string; language?: string; translatedText: string; createdBy?: string },
  ) {
    const language = data.language ?? "ne";
    const existing = await this.prisma.translationTerm.findFirst({
      where: { tenantId, domain: data.domain, sourceText: data.sourceText, language },
    });
    if (existing) {
      if (existing.translatedText === data.translatedText) return existing;
      return this.prisma.translationTerm.update({
        where: { id: existing.id },
        data: { translatedText: data.translatedText, version: { increment: 1 } },
      });
    }
    return this.prisma.translationTerm.create({
      data: {
        tenantId,
        domain: data.domain,
        sourceText: data.sourceText,
        language,
        translatedText: data.translatedText,
      },
    });
  }

  async bulkUpsertTerms(
    tenantId: string,
    terms: Array<{ domain: string; sourceText: string; language?: string; translatedText: string }>,
  ) {
    const out = [];
    for (const t of terms) out.push(await this.upsertTerm(tenantId, t));
    return out;
  }

  /** Translate presentation text; missing terms fall back to the source. */
  async t(tenantId: string, domain: string, text: string, language = "ne"): Promise<string> {
    if (language === "en") return text;
    const term = await this.prisma.translationTerm.findFirst({
      where: { tenantId, domain, sourceText: text, language, isActive: true },
    });
    return term?.translatedText ?? text;
  }

  /**
   * §72.2: localize a structured prescription for patient-facing display.
   * Structured values (strength, dosage, route, frequency, duration) are
   * preserved verbatim unless an exact dictionary term exists — medication
   * safety-critical text is never free-translated.
   */
  async localizePrescription(
    tenantId: string,
    instructions: StructuredMedicationInstruction,
    language = "ne",
  ): Promise<{
    language: string;
    fields: Array<{ key: string; english: string | undefined; localized: string | undefined; structured: boolean }>;
  }> {
    if (language === "en") {
      return {
        language,
        fields: Object.entries(instructions)
          .filter(([, v]) => v !== undefined)
          .map(([key, v]) => ({ key, english: String(v), localized: String(v), structured: true })),
      };
    }
    const terms = await this.prisma.translationTerm.findMany({
      where: { tenantId, language, isActive: true, domain: { in: ["clinical", "medication"] } },
    });
    const dict = new Map(terms.map((t) => [t.sourceText, t.translatedText]));

    const fields: Array<{ key: string; english: string | undefined; localized: string | undefined; structured: boolean }> = [];
    const safeKeys: Array<keyof StructuredMedicationInstruction> = [
      "medicineName", "strength", "dosage", "route", "frequency", "duration", "quantity", "timing",
    ];
    for (const key of safeKeys) {
      const value = instructions[key];
      if (value === undefined) continue;
      fields.push({
        key,
        english: String(value),
        localized: dict.get(String(value)) ?? String(value),
        structured: true,
      });
    }
    // Boolean/food flags get fixed, dictionary-backed labels.
    if (instructions.beforeFood) {
      fields.push({ key: "beforeFood", english: "Before food", localized: dict.get("Before food") ?? "खाना अघि", structured: true });
    }
    if (instructions.afterFood) {
      fields.push({ key: "afterFood", english: "After food", localized: dict.get("After food") ?? "खाना पछि", structured: true });
    }
    if (instructions.prn) {
      fields.push({ key: "prn", english: "As needed (PRN)", localized: dict.get("As needed (PRN)") ?? "आवश्यकता अनुसार", structured: true });
    }
    if (instructions.specialInstructions) {
      fields.push({
        key: "specialInstructions",
        english: instructions.specialInstructions,
        localized: dict.get(instructions.specialInstructions) ?? instructions.specialInstructions,
        structured: true,
      });
    }
    return { language, fields };
  }

  /**
   * §72.4: narrow-format thermal receipt lines with mixed-script output.
   * Returns printable lines; the client/printer layer handles Devanagari
   * shaping and font fallback (§72.5) — this builds the content only.
   */
  async buildThermalReceipt(
    tenantId: string,
    input: BilingualReceiptInput,
    language = "ne",
  ): Promise<{ header: string[]; body: Array<{ label: string; labelLocalized: string; amount: string }>; footer: string[]; total: string; width: number }> {
    const width = input.thermalWidthColumns ?? 32;
    const terms = await this.prisma.translationTerm.findMany({
      where: { tenantId, language, isActive: true, domain: { in: ["billing", "administrative"] } },
    });
    const dict = new Map(terms.map((t) => [t.sourceText, t.translatedText]));
    const tr = (s: string) => (language === "en" ? s : dict.get(s) ?? s);

    const money = (n: number) => `${input.currency ?? "NPR"} ${n.toFixed(2)}`;

    const header = [
      input.facilityNameNe ?? input.facilityName,
      `${tr("Receipt No")}: ${input.receiptNumber}`,
      `${tr("Date")}: ${input.dateTime.toISOString().replace("T", " ").slice(0, 16)}`,
      ...(input.patientName ? [`${tr("Patient")}: ${input.patientName}`] : []),
      ...(input.cashier ? [`${tr("Cashier")}: ${input.cashier}`] : []),
      ...(input.paymentMethod ? [`${tr("Payment")}: ${input.paymentMethod}`] : []),
    ];

    const body = input.lines.map((l) => ({
      label: l.label,
      labelLocalized: l.labelNe ?? tr(l.label),
      amount: money(l.amount),
    }));

    const footer = [
      input.barcodeValue ? `BARCODE: ${input.barcodeValue}` : "",
      tr("Thank you for your visit"),
    ].filter(Boolean);

    return { header, body, footer, total: money(input.total), width };
  }
}
