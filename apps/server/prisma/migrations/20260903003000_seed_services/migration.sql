-- Migration: seed_service_categories_and_services
-- Description: Seed the 17 standard ServiceCategories and a representative set
--              of BillingServices (with NPR prices) for every tenant that does
--              not already have them. Idempotent and additive only - it never
--              deletes or overwrites existing rows, so it is safe on production.
--
-- The DischargeModal's "Add Service" picker and the Service Master page load
-- from billing_services/service_categories. Previously these were never seeded,
-- so the picker was empty in every group.

-- 1. Service Categories (17 standard groups)
--    Uses a VALUES list cross-joined with the tenants table so every tenant gets
--    a full set. ON CONFLICT (tenantId, code) is a no-op if already present.
INSERT INTO "service_categories" ("id", "tenantId", "name", "code", "description", "displayOrder", "isActive", "createdAt", "updatedAt")
SELECT
  'cat-' || t.id || '-' || v.code,
  t.id,
  v.name,
  v.code,
  v.description,
  v.displayOrder,
  true,
  now(),
  now()
FROM (SELECT id FROM "tenants") t
JOIN (VALUES
  ('Room Charges', 'ROOM', 'Bed, ward and room accommodation', 1),
  ('Doctor / Consultant Charges', 'DOCTOR', 'Consultation, specialist and surgeon fees', 2),
  ('Nursing Charges', 'NURSING', 'Nursing care, injections, IV, dressings', 3),
  ('Laboratory', 'LABORATORY', 'Lab tests, pathology, microbiology', 4),
  ('Radiology / Imaging', 'RADIOLOGY', 'X-ray, ultrasound, CT, MRI, ECG', 5),
  ('OT / Surgery', 'OT_SURGERY', 'Operation theatre and surgical procedures', 6),
  ('Procedure Charges', 'PROCEDURE', 'Minor and major procedure charges', 7),
  ('Pharmacy', 'PHARMACY', 'Medicines and pharmacy items', 8),
  ('Medical Consumables', 'CONSUMABLES', 'Syringes, gloves, sutures, consumables', 9),
  ('Blood Bank', 'BLOOD_BANK', 'Blood, plasma and transfusion services', 10),
  ('Diet', 'DIET', 'Patient meals and nutrition', 11),
  ('Oxygen / Respiratory', 'OXYGEN', 'Oxygen, nebulization, ventilator support', 12),
  ('Equipment Charges', 'EQUIPMENT', 'Equipment rental and usage', 13),
  ('Ambulance', 'AMBULANCE', 'Ambulance and patient transport', 14),
  ('Administrative Charges', 'ADMINISTRATIVE', 'Admission, registration, admin fees', 15),
  ('Medical Documents', 'DOCUMENTS', 'Reports, certificates, medical records', 16),
  ('Miscellaneous', 'MISCELLANEOUS', 'Other charges', 17)
) AS v(name, code, description, displayOrder)
ON CONFLICT ("tenantId", "code") DO NOTHING;

-- 2. Billing Services (representative set with NPR prices)
--    Uses a VALUES list cross-joined with tenants. The service name includes the
--    category keyword so DischargeModal.matchService() groups each correctly.
--    ON CONFLICT (tenantId, code) is a no-op if a row already exists.
INSERT INTO "billing_services"
  ("id", "tenantId", "code", "name", "categoryId", "price", "taxPercent",
   "serviceType", "unit", "isActive", "taxable", "requiresQuantity",
   "isRoomCharge", "displayOrder", "createdAt", "updatedAt")
SELECT
  'svc-' || t.id || '-' || v.code,
  t.id,
  v.code,
  v.name,
  'cat-' || t.id || '-' || v.catCode,
  v.price,
  v.taxPercent,
  v.serviceType::"ServiceType",
  v.unit,
  true,
  v.taxable,
  v.requiresQuantity,
  v.isRoomCharge,
  v.displayOrder,
  now(),
  now()
FROM (SELECT id FROM "tenants") t
JOIN (VALUES
  -- Room Charges
  ('RM-GW', 'General Ward Room Charge', 'ROOM', 1000, 0, 'PER_DAY', 'per day', true, true, true, 1),
  ('RM-PW', 'Private Room Charge', 'ROOM', 3000, 0, 'PER_DAY', 'per day', true, true, true, 2),
  ('RM-DEL', 'Deluxe Room Charge', 'ROOM', 5000, 0, 'PER_DAY', 'per day', true, true, true, 3),
  ('RM-ICU', 'ICU Room Charge', 'ROOM', 5000, 0, 'PER_DAY', 'per day', true, true, true, 4),
  ('RM-EMER', 'Emergency Room Charge', 'ROOM', 1200, 0, 'PER_DAY', 'per day', true, true, true, 5),
  ('RM-COT', 'Baby Cot Charge', 'ROOM', 500, 0, 'PER_DAY', 'per day', true, true, true, 6),
  -- Doctor / Consultant
  ('CONS-GP', 'General Practitioner Consultation', 'DOCTOR', 400, 0, 'PER_VISIT', 'per visit', true, true, true, 1),
  ('CONS-SP', 'Specialist Consultation', 'DOCTOR', 600, 0, 'PER_VISIT', 'per visit', true, true, true, 2),
  ('CONS-SR', 'Senior Consultant Fee', 'DOCTOR', 1000, 0, 'PER_VISIT', 'per visit', true, true, true, 3),
  ('CONS-SURG', 'Surgeon Fee', 'DOCTOR', 2000, 0, 'PER_VISIT', 'per visit', true, true, true, 4),
  ('CONS-AN', 'Anesthetist Fee', 'DOCTOR', 1500, 0, 'PER_VISIT', 'per visit', true, true, true, 5),
  ('CONS-VISIT', 'Doctor Visiting Charge', 'DOCTOR', 500, 0, 'PER_VISIT', 'per visit', true, true, true, 6),
  -- Nursing Charges
  ('NUR-DAY', 'Nursing Care Charge', 'NURSING', 300, 0, 'PER_DAY', 'per day', true, true, true, 1),
  ('NUR-INJ', 'Injection Administration', 'NURSING', 50, 0, 'PER_UNIT', 'per item', true, true, true, 2),
  ('NUR-IV', 'IV Therapy / Drip', 'NURSING', 150, 0, 'PER_UNIT', 'per item', true, true, true, 3),
  ('NUR-DRS', 'Dressing Charge', 'NURSING', 100, 0, 'PER_UNIT', 'per item', true, true, true, 4),
  ('NUR-CATH', 'Catheterization', 'NURSING', 200, 0, 'PER_UNIT', 'per item', true, true, true, 5),
  ('NUR-MON', 'Vital Monitoring Charge', 'NURSING', 250, 0, 'PER_DAY', 'per day', true, true, true, 6),
  -- Laboratory
  ('LAB-CBC', 'Complete Blood Count', 'LABORATORY', 500, 0, 'PER_TEST', 'per test', true, true, true, 1),
  ('LAB-BSF', 'Blood Sugar (Fasting)', 'LABORATORY', 200, 0, 'PER_TEST', 'per test', true, true, true, 2),
  ('LAB-LFT', 'Liver Function Test', 'LABORATORY', 700, 0, 'PER_TEST', 'per test', true, true, true, 3),
  ('LAB-KFT', 'Kidney Function Test', 'LABORATORY', 700, 0, 'PER_TEST', 'per test', true, true, true, 4),
  ('LAB-LIPID', 'Lipid Profile', 'LABORATORY', 800, 0, 'PER_TEST', 'per test', true, true, true, 5),
  ('LAB-TFT', 'Thyroid Function Test', 'LABORATORY', 900, 0, 'PER_TEST', 'per test', true, true, true, 6),
  ('LAB-URINE', 'Urine Analysis', 'LABORATORY', 300, 0, 'PER_TEST', 'per test', true, true, true, 7),
  ('LAB-BG', 'Blood Group Test', 'LABORATORY', 250, 0, 'PER_TEST', 'per test', true, true, true, 8),
  ('LAB-CRP', 'CRP Test', 'LABORATORY', 500, 0, 'PER_TEST', 'per test', true, true, true, 9),
  ('LAB-HBA1C', 'HbA1c Test', 'LABORATORY', 600, 0, 'PER_TEST', 'per test', true, true, true, 10),
  -- Radiology / Imaging
  ('RAD-XRCH', 'X-Ray Chest PA', 'RADIOLOGY', 800, 0, 'PER_TEST', 'per test', true, true, true, 1),
  ('RAD-XR', 'X-Ray (Other)', 'RADIOLOGY', 700, 0, 'PER_TEST', 'per test', true, true, true, 2),
  ('RAD-USG', 'Ultrasound (USG)', 'RADIOLOGY', 1200, 0, 'PER_TEST', 'per test', true, true, true, 3),
  ('RAD-CT', 'CT Scan', 'RADIOLOGY', 5000, 0, 'PER_TEST', 'per test', true, true, true, 4),
  ('RAD-MRI', 'MRI Scan', 'RADIOLOGY', 12000, 0, 'PER_TEST', 'per test', true, true, true, 5),
  ('RAD-ECG', 'ECG', 'RADIOLOGY', 400, 0, 'PER_TEST', 'per test', true, true, true, 6),
  ('RAD-ECHO', 'Echocardiography', 'RADIOLOGY', 2500, 0, 'PER_TEST', 'per test', true, true, true, 7),
  -- OT / Surgery
  ('OT-MINOR', 'Minor OT Procedure', 'OT_SURGERY', 2500, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 1),
  ('OT-MAJOR', 'Major Surgery', 'OT_SURGERY', 10000, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 2),
  ('OT-LSCS', 'LSCS (Cesarean) Surgery', 'OT_SURGERY', 15000, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 3),
  ('OT-APP', 'Appendectomy Surgery', 'OT_SURGERY', 8000, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 4),
  ('OT-THEATRE', 'Operation Theatre Charge', 'OT_SURGERY', 2000, 0, 'PER_HOUR', 'per hour', true, true, true, 5),
  -- Procedure Charges
  ('PRC-DIAL', 'Dialysis Procedure', 'PROCEDURE', 3000, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 1),
  ('PRC-ENDOS', 'Endoscopy Procedure', 'PROCEDURE', 4000, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 2),
  ('PRC-BIOPSY', 'Biopsy Procedure', 'PROCEDURE', 2000, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 3),
  ('PRC-CATH', 'Cardiac Catheterization Procedure', 'PROCEDURE', 12000, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 4),
  ('PRC-LAP', 'Laparoscopic Procedure', 'PROCEDURE', 6000, 0, 'PER_PROCEDURE', 'per procedure', true, true, true, 5),
  -- Pharmacy
  ('PHM-PARA', 'Paracetamol 500mg', 'PHARMACY', 3, 0, 'PER_ITEM', 'per tablet', true, true, true, 1),
  ('PHM-AMOX', 'Amoxicillin 500mg', 'PHARMACY', 15, 0, 'PER_ITEM', 'per capsule', true, true, true, 2),
  ('PHM-AZI', 'Azithromycin 500mg', 'PHARMACY', 85, 0, 'PER_ITEM', 'per tablet', true, true, true, 3),
  ('PHM-OME', 'Omeprazole 20mg', 'PHARMACY', 8, 0, 'PER_ITEM', 'per capsule', true, true, true, 4),
  ('PHM-MET', 'Metformin 500mg', 'PHARMACY', 4, 0, 'PER_ITEM', 'per tablet', true, true, true, 5),
  ('PHM-IVFL', 'IV Fluid (RL/NS)', 'PHARMACY', 150, 0, 'PER_ITEM', 'per bottle', true, true, true, 6),
  ('PHM-ORS', 'ORS Sachet', 'PHARMACY', 25, 0, 'PER_ITEM', 'per sachet', true, true, true, 7),
  -- Medical Consumables
  ('CON-SYR', 'Syringe', 'CONSUMABLES', 15, 0, 'PER_ITEM', 'per item', true, true, true, 1),
  ('CON-GLV', 'Gloves Pair', 'CONSUMABLES', 25, 0, 'PER_ITEM', 'per pair', true, true, true, 2),
  ('CON-SUT', 'Suture Material', 'CONSUMABLES', 300, 0, 'PER_ITEM', 'per item', true, true, true, 3),
  ('CON-CANN', 'IV Cannula', 'CONSUMABLES', 80, 0, 'PER_ITEM', 'per item', true, true, true, 4),
  ('CON-MASK', 'Surgical Mask', 'CONSUMABLES', 10, 0, 'PER_ITEM', 'per item', true, true, true, 5),
  ('CON-GAUZE', 'Gauze / Dressing Material', 'CONSUMABLES', 40, 0, 'PER_ITEM', 'per item', true, true, true, 6),
  -- Blood Bank
  ('BLD-UN', 'Whole Blood Unit', 'BLOOD_BANK', 2500, 0, 'PER_UNIT', 'per unit', true, true, true, 1),
  ('BLD-PLT', 'Platelet Unit', 'BLOOD_BANK', 4000, 0, 'PER_UNIT', 'per unit', true, true, true, 2),
  ('BLD-PLASMA', 'Plasma Unit', 'BLOOD_BANK', 3000, 0, 'PER_UNIT', 'per unit', true, true, true, 3),
  ('BLD-TRANS', 'Blood Transfusion Service', 'BLOOD_BANK', 500, 0, 'PER_UNIT', 'per unit', true, true, true, 4),
  -- Diet
  ('DIET-DAY', 'Patient Diet Charge', 'DIET', 300, 0, 'PER_DAY', 'per day', true, true, true, 1),
  ('DIET-DIAB', 'Diabetic Diet Charge', 'DIET', 350, 0, 'PER_DAY', 'per day', true, true, true, 2),
  ('DIET-HIGH', 'High Protein Diet Charge', 'DIET', 400, 0, 'PER_DAY', 'per day', true, true, true, 3),
  ('DIET-BEV', 'Beverage / Snack Charge', 'DIET', 50, 0, 'PER_UNIT', 'per item', true, true, true, 4),
  -- Oxygen / Respiratory
  ('OXY-HR', 'Oxygen Supply (per hour)', 'OXYGEN', 100, 0, 'PER_HOUR', 'per hour', true, true, true, 1),
  ('OXY-NEB', 'Nebulization Charge', 'OXYGEN', 150, 0, 'PER_UNIT', 'per item', true, true, true, 2),
  ('OXY-VENT', 'Ventilator Support (per day)', 'OXYGEN', 8000, 0, 'PER_DAY', 'per day', true, true, true, 3),
  ('OXY-CPAP', 'CPAP / BiPAP Therapy (per day)', 'OXYGEN', 5000, 0, 'PER_DAY', 'per day', true, true, true, 4),
  -- Equipment Charges
  ('EQ-MON', 'Patient Monitor Rental', 'EQUIPMENT', 1000, 0, 'PER_DAY', 'per day', true, true, true, 1),
  ('EQ-PUMP', 'Infusion Pump Rental', 'EQUIPMENT', 800, 0, 'PER_DAY', 'per day', true, true, true, 2),
  ('EQ-BED', 'Special Bed Rental', 'EQUIPMENT', 1500, 0, 'PER_DAY', 'per day', true, true, true, 3),
  ('EQ-SUCTION', 'Suction Machine Rental', 'EQUIPMENT', 600, 0, 'PER_DAY', 'per day', true, true, true, 4),
  -- Ambulance
  ('AMB-BASE', 'Ambulance (Base Charge)', 'AMBULANCE', 1500, 0, 'PER_UNIT', 'per trip', true, true, true, 1),
  ('AMB-KM', 'Ambulance (per km)', 'AMBULANCE', 50, 0, 'PER_UNIT', 'per km', true, true, true, 2),
  ('AMB-EMER', 'Emergency Ambulance Call', 'AMBULANCE', 2500, 0, 'PER_UNIT', 'per trip', true, true, true, 3),
  ('AMB-TRANS', 'Patient Transfer Service', 'AMBULANCE', 2000, 0, 'PER_UNIT', 'per trip', true, true, true, 4),
  -- Administrative Charges
  ('ADM-REG', 'Registration Fee', 'ADMINISTRATIVE', 100, 0, 'FIXED', 'per visit', true, true, true, 1),
  ('ADM-ADM', 'Admission Charge', 'ADMINISTRATIVE', 300, 0, 'FIXED', 'per admission', true, true, true, 2),
  ('ADM-DIS', 'Discharge Processing Fee', 'ADMINISTRATIVE', 200, 0, 'FIXED', 'per discharge', true, true, true, 3),
  ('ADM-FILE', 'Patient File / Record Charge', 'ADMINISTRATIVE', 50, 0, 'FIXED', 'per item', true, true, true, 4),
  ('ADM-ADMIN', 'Administrative Service Charge', 'ADMINISTRATIVE', 150, 0, 'FIXED', 'per item', true, true, true, 5),
  -- Medical Documents
  ('DOC-SUMM', 'Discharge Summary Report', 'DOCUMENTS', 300, 0, 'PER_UNIT', 'per report', true, true, true, 1),
  ('DOC-CERT', 'Medical Certificate', 'DOCUMENTS', 200, 0, 'PER_UNIT', 'per certificate', true, true, true, 2),
  ('DOC-REC', 'Medical Records Copy', 'DOCUMENTS', 100, 0, 'PER_UNIT', 'per record', true, true, true, 3),
  ('DOC-REPORT', 'Test Report Copy', 'DOCUMENTS', 50, 0, 'PER_UNIT', 'per report', true, true, true, 4),
  -- Miscellaneous
  ('MISC-OTHER', 'Miscellaneous Charge', 'MISCELLANEOUS', 100, 0, 'VARIABLE', NULL, true, true, true, 1)
) AS v(code, name, catCode, price, taxPercent, serviceType, unit, isRoomCharge, taxable, requiresQuantity, displayOrder)
ON CONFLICT ("tenantId", "code") DO NOTHING;
