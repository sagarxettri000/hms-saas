import {
  GENDERS,
  BLOOD_GROUPS,
  PAYMENT_METHODS,
  PATIENT_REF,
  APPOINTMENT_TYPES,
  INVOICE_TYPES,
  ACCOUNT_TYPES,
} from '@/lib/options';

describe('options', () => {
  it('GENDERS contains all standard values', () => {
    expect(GENDERS).toEqual([
      { value: 'MALE', label: 'Male' },
      { value: 'FEMALE', label: 'Female' },
      { value: 'OTHER', label: 'Other' },
    ]);
  });

  it('BLOOD_GROUPS has unique values and includes O+', () => {
    const values = BLOOD_GROUPS.map((g) => g.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain('O_POS');
    expect(values).toContain('AB_NEG');
  });

  it('PAYMENT_METHODS includes CASH and CARD', () => {
    const values = PAYMENT_METHODS.map((m) => m.value);
    expect(values).toContain('CASH');
    expect(values).toContain('CARD');
    expect(values).toContain('ONLINE');
  });

  it('APPOINTMENT_TYPES includes TELEMEDICINE', () => {
    const values = APPOINTMENT_TYPES.map((a) => a.value);
    expect(values).toContain('TELEMEDICINE');
  });

  it('INVOICE_TYPES has no duplicate values', () => {
    const values = INVOICE_TYPES.map((i) => i.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('ACCOUNT_TYPES covers chart of accounts categories', () => {
    const values = ACCOUNT_TYPES.map((a) => a.value);
    expect(values).toEqual(
      expect.arrayContaining(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
    );
  });

  it('PATIENT_REF points to /patients endpoint', () => {
    expect(PATIENT_REF.endpoint).toBe('/patients');
    expect(PATIENT_REF.labelKeys).toContain('mrn');
  });
});
