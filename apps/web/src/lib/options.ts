export const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export const BLOOD_GROUPS = [
  { value: 'A_POS', label: 'A+' },
  { value: 'A_NEG', label: 'A-' },
  { value: 'B_POS', label: 'B+' },
  { value: 'B_NEG', label: 'B-' },
  { value: 'AB_POS', label: 'AB+' },
  { value: 'AB_NEG', label: 'AB-' },
  { value: 'O_POS', label: 'O+' },
  { value: 'O_NEG', label: 'O-' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

export const MARITAL_STATUS = [
  { value: 'SINGLE', label: 'Single' },
  { value: 'MARRIED', label: 'Married' },
  { value: 'DIVORCED', label: 'Divorced' },
  { value: 'WIDOWED', label: 'Widowed' },
];

export const PATIENT_TYPES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'FOREIGN', label: 'Foreign' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'STAFF_RELATIVE', label: 'Staff relative' },
  { value: 'CORPORATE', label: 'Corporate' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'OTHER', label: 'Other' },
];

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'WALLET', label: 'Wallet' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'OTHER', label: 'Other' },
];

export const APPOINTMENT_TYPES = [
  { value: 'OPD', label: 'OPD' },
  { value: 'FOLLOWUP', label: 'Follow up' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'TELEMEDICINE', label: 'Telemedicine' },
];

export const ENCOUNTER_TYPES = [
  { value: 'OPD', label: 'OPD' },
  { value: 'IPD', label: 'IPD' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'PROCEDURE', label: 'Procedure' },
  { value: 'FOLLOWUP', label: 'Follow up' },
];

export const INVOICE_TYPES = [
  { value: 'OPD', label: 'OPD' },
  { value: 'IPD', label: 'IPD' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'SPECIAL_OPD', label: 'Special OPD' },
  { value: 'PROCEDURE', label: 'Procedure' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'DISCHARGE', label: 'Discharge' },
  { value: 'LAB', label: 'Lab' },
  { value: 'RADIOLOGY', label: 'Radiology' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'OT', label: 'OT' },
  { value: 'AMBULANCE', label: 'Ambulance' },
];

export const STORE_TYPES = [
  { value: 'MAIN', label: 'Main store' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'WARD', label: 'Ward' },
  { value: 'KITCHEN', label: 'Kitchen' },
  { value: 'LAB', label: 'Laboratory' },
  { value: 'OTHER', label: 'Other' },
];

export const LEAVE_TYPES = [
  { value: 'CASUAL', label: 'Casual' },
  { value: 'SICK', label: 'Sick' },
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'MATERNITY', label: 'Maternity' },
  { value: 'PATERNITY', label: 'Paternity' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'OTHER', label: 'Other' },
];

export const OT_TYPES = [
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'ELECTIVE', label: 'Elective' },
  { value: 'AMBULATORY', label: 'Ambulatory' },
];

export const ANESTHESIA_TYPES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'SPINAL', label: 'Spinal' },
  { value: 'EPIDURAL', label: 'Epidural' },
  { value: 'LOCAL', label: 'Local' },
  { value: 'REGIONAL', label: 'Regional' },
  { value: 'MAC', label: 'MAC' },
  { value: 'OTHER', label: 'Other' },
];

export const ACCOUNT_TYPES = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'INCOME', label: 'Income' },
  { value: 'EXPENSE', label: 'Expense' },
];

export const BLOOD_COMPONENTS = [
  { value: 'WHOLE_BLOOD', label: 'Whole blood' },
  { value: 'PACKED_RBC', label: 'Packed RBC' },
  { value: 'PLATELETS', label: 'Platelets' },
  { value: 'PLASMA', label: 'Plasma' },
  { value: 'CRYO', label: 'Cryoprecipitate' },
];

export const NOTIFICATION_CHANNELS = [
  { value: 'IN_APP', label: 'In app' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'PUSH', label: 'Push' },
];

export const PATIENT_REF = {
  valueKey: 'id',
  labelKeys: ['firstName', 'lastName', 'mrn', 'mobile'],
  endpoint: '/patients',
};
export const DOCTOR_REF = { valueKey: 'id', labelKeys: ['user.firstName', 'user.lastName'], endpoint: '/doctors' };
export const DEPARTMENT_REF = { valueKey: 'id', labelKeys: ['name'], endpoint: '/departments' };
export const PROVIDER_REF = { valueKey: 'id', labelKeys: ['name'], endpoint: '/insurance/providers' };
export const MEMBERSHIP_PACKAGE_REF = { valueKey: 'id', labelKeys: ['name'], endpoint: '/memberships/packages' };
export const STORE_REF = { valueKey: 'id', labelKeys: ['name'], endpoint: '/pharmacy/stores' };
export const ACCOUNT_REF = { valueKey: 'id', labelKeys: ['name'], endpoint: '/accounting/accounts' };
