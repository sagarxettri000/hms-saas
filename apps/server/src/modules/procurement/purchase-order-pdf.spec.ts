import { buildPurchaseOrderPdf } from "./purchase-order-pdf";

const tenant: any = {
  name: "NB Maitri Hospital",
  code: "NBMH",
  addressLine1: "Buddha Marg",
  addressLine2: "Baneshwor",
  city: "Kathmandu",
  district: "Kathmandu",
  province: "Bagmati",
  country: "Nepal",
  postalCode: "44600",
  phone: "+977-1-5500000",
  email: "info@nbmaitri.com",
  website: "nbmaitri.com",
  panNumber: "301234567",
  vatNumber: "301234567",
  registrationNumber: "REG-0091",
  currency: "NPR",
};

const supplier: any = {
  name: "MedSupply Nepal Pvt Ltd",
  code: "SUP-001",
  contactPerson: "Sita Thapa",
  phone: "+977-1-4440000",
  email: "orders@medsupply.com.np",
  address: "Putalisadak, Kathmandu",
  billingAddress: "Billing: Kamaladi, Kathmandu",
  shippingAddress: "Shipping: Thankot, Kathmandu",
  panNumber: "302345678",
  vatNumber: "302345678",
  registrationNumber: "SUP-REG-002",
  category: "MEDICAL SUPPLIES",
  paymentTerms: "Net 30",
  bankName: "Nabil Bank",
  bankAccount: "1234567890",
  bankBranch: "New Baneshwor",
};

const order: any = {
  id: "po_1",
  poNumber: "PO-20260915-0001",
  poType: "STANDARD",
  status: "SENT",
  currency: "NPR",
  revision: 2,
  validityDays: 30,
  paymentTerms: "Net 30 days",
  paymentMethod: "BANK_TRANSFER",
  orderDate: new Date("2026-09-15T00:00:00Z"),
  expectedDate: new Date("2026-09-25T00:00:00Z"),
  deliveryAddress: "Main Store, NB Maitri Hospital, Baneshwor",
  subtotal: 6000,
  discountPercent: 10,
  discountAmount: 600,
  taxableAmount: 5400,
  taxPercent: 13,
  taxAmount: 702,
  tdsPercent: 1.5,
  tdsAmount: 81,
  freightAmount: 200,
  insuranceAmount: 100,
  otherCharges: 50,
  grandTotal: 6371,
  totalAmount: 6371,
  terms:
    "Delivery within 15 business days. Warranty as per manufacturer policy.",
  notes: "Urgent requirement for Q4 stock replenishment.",
  supplier,
  store: { name: "General Store", code: "GS-01", location: "Ground Floor" },
  purchaseRequest: {
    requestNumber: "PR-20260910-0003",
    justification: "Annual procurement of PPE and consumables for Q4.",
    priority: "HIGH",
    neededBy: new Date("2026-09-30T00:00:00Z"),
    department: "Procurement",
    requestedBy: { firstName: "Sunita", middleName: "", lastName: "Gurung" },
    approvedBy: { firstName: "Raj", middleName: "K.", lastName: "Shrestha" },
    approvedAt: new Date("2026-09-12T10:00:00Z"),
  },
  goodsReceipts: [
    {
      grnNumber: "GRN-20260914-0001",
      receivedDate: new Date("2026-09-14T00:00:00Z"),
      invoiceNumber: "INV-2026-123",
      items: [{ itemName: "N95 Masks", quantity: 500 }],
    },
  ],
  createdBy: { firstName: "Admin", middleName: "", lastName: "User" },
  updatedBy: null,
  approvedBy: { firstName: "Raj", middleName: "K.", lastName: "Shrestha" },
  approvedAt: new Date("2026-09-12T10:00:00Z"),
  vendorAcceptedBy: null,
  vendorAcceptedAt: null,
  createdAt: new Date("2026-09-15T06:00:00Z"),
  updatedAt: new Date("2026-09-15T06:00:00Z"),
  items: [
    {
      itemName: "N95 Respirator Mask (Box of 20)",
      itemCode: "PPE-N95-01",
      category: "PPE",
      brand: "3M",
      model: "8210",
      specification: "NIOSH N95 certified, 20 per box",
      hsCode: "6307.90.20",
      unit: "Box",
      quantity: 100,
      unitPrice: 30,
      discountPercent: 10,
      discountAmount: 300,
      taxableAmount: 2700,
      taxPercent: 13,
      taxAmount: 351,
      otherCharges: 0,
      lineTotal: 3051,
      totalPrice: 3051,
      expectedDelivery: new Date("2026-09-22T00:00:00Z"),
      batchRequired: true,
      expiryRequired: true,
      sterilityRequired: false,
      coldChainRequired: false,
      temperatureRequirement: null,
      warrantyRequired: false,
      calibrationRequired: false,
      installationRequired: false,
      trainingRequired: false,
      criticality: "HIGH",
    },
    {
      itemName: "Disposable Surgical Gloves (Box of 100)",
      itemCode: "PPE-GLV-02",
      category: "PPE",
      brand: "Ansell",
      model: "TouchNTuff 92-675",
      specification: "Latex-free, nitrile, size M",
      hsCode: "4015.19.00",
      unit: "Box",
      quantity: 200,
      unitPrice: 15,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: 3000,
      taxPercent: 13,
      taxAmount: 390,
      otherCharges: 50,
      lineTotal: 3440,
      totalPrice: 3440,
      expectedDelivery: null,
      batchRequired: false,
      expiryRequired: true,
      sterilityRequired: false,
      coldChainRequired: false,
      temperatureRequirement: null,
      warrantyRequired: false,
      calibrationRequired: false,
      installationRequired: false,
      trainingRequired: false,
      criticality: null,
    },
  ],
};

describe("buildPurchaseOrderPdf", () => {
  it("returns a valid PDF buffer with PDF-1.4 header and %%EOF", () => {
    const buffer = buildPurchaseOrderPdf(order, tenant, "Admin User");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const content = buffer.toString("latin1");
    expect(content.startsWith("%PDF-1.4")).toBe(true);
    expect(content).toContain("%%EOF");
  });

  it("contains letterhead and hospital identity", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("NB Maitri Hospital");
    expect(content).toContain("PAN: 301234567");
    expect(content).toContain("VAT: 301234567");
    expect(content).toContain("REG-0091");
    expect(content).toContain("nbmaitri.com");
    expect(content).toContain("Buddha Marg");
  });

  it("renders the PURCHASE ORDER title and metadata", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("PURCHASE ORDER");
    expect(content).toContain("PO-20260915-0001");
    expect(content).toContain("Standard");
    expect(content).toContain("Sent");
    expect(content).toContain("REV-02");
  });

  it("renders the buyer and vendor blocks", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("BUYER / HOSPITAL");
    expect(content).toContain("VENDOR / SUPPLIER");
    expect(content).toContain("MedSupply Nepal Pvt Ltd");
    expect(content).toContain("SUP-001");
    expect(content).toContain("Sita Thapa");
    expect(content).toContain("+977-1-4440000");
    expect(content).toContain("Putalisadak");
    expect(content).toContain("Kamaladi");
    expect(content).toContain("Thankot");
    expect(content).toContain("302345678");
    expect(content).toContain("MEDICAL SUPPLIES");
    expect(content).toContain("Nabil Bank");
    expect(content).toContain("1234567890");
  });

  it("renders the procurement reference block", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("PROCUREMENT REFERENCES");
    expect(content).toContain("PR-20260910-0003");
    expect(content).toContain("Sunita Gurung");
    expect(content).toContain("Procurement");
    expect(content).toContain("HIGH");
  });

  it("renders the item table with all line items and their financial values", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("PURCHASE ORDER ITEMS");
    expect(content).toContain("N95 Respirator Mask");
    expect(content).toContain("PPE-N95-01");
    expect(content).toContain("3M");
    expect(content).toContain("Disposable Surgical Gloves");
    expect(content).toContain("Ansell");
    expect(content).toContain("3,051.00");
    expect(content).toContain("3,440.00");
  });

  it("renders hospital-specific requirements for flagged items", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("HOSPITAL-SPECIFIC");
    expect(content).toContain("Batch/Lot required");
    expect(content).toContain("Expiry required");
    expect(content).toContain("Criticality: HIGH");
  });

  it("renders the financial summary with all computed totals", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("FINANCIAL SUMMARY");
    expect(content).toContain("GRAND TOTAL");
    expect(content).toContain("6,371.00");
    expect(content).toContain("TDS");
    expect(content).toContain("Freight");
    expect(content).toContain("Insurance");
    expect(content).toContain("Amount in Words:");
    expect(content).toContain("NPR");
  });

  it("renders payment terms and delivery blocks", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("PAYMENT TERMS");
    expect(content).toContain("Net 30 days");
    expect(content).toContain("Bank Transfer");
    expect(content).toContain("DELIVERY & LOGISTICS");
    expect(content).toContain("General Store");
    expect(content).toContain("Main Store");
  });

  it("renders goods receipt linkage", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("GOODS RECEIPTS");
    expect(content).toContain("GRN-20260914-0001");
    expect(content).toContain("INV-2026-123");
  });

  it("renders purchase justification, approval and terms sections", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("PURCHASE JUSTIFICATION");
    expect(content).toContain("Annual procurement of PPE");
    expect(content).toContain("APPROVAL");
    expect(content).toContain("Raj K. Shrestha");
    expect(content).toContain("TERMS & CONDITIONS");
    expect(content).toContain("Delivery within 15 business days");
    expect(content).toContain("Urgent requirement");
  });

  it("renders document control and signature blocks", () => {
    const content = buildPurchaseOrderPdf(order, tenant, "Admin User").toString(
      "latin1",
    );
    expect(content).toContain("DOCUMENT CONTROL");
    expect(content).toContain("Created By");
    expect(content).toContain("Admin User");
    expect(content).toContain("Authorized Signature \\(Hospital\\)");
    expect(content).toContain("Authorized Signature \\(Vendor\\)");
  });

  it("handles a minimal PO with no optional fields", () => {
    const minimalOrder: any = {
      id: "po_min",
      poNumber: "PO-20260915-0099",
      poType: null,
      status: "DRAFT",
      currency: "NPR",
      revision: null,
      validityDays: null,
      orderDate: null,
      expectedDate: null,
      deliveryAddress: null,
      subtotal: null,
      discountPercent: null,
      discountAmount: null,
      taxableAmount: null,
      taxPercent: null,
      taxAmount: null,
      tdsAmount: null,
      freightAmount: null,
      insuranceAmount: null,
      otherCharges: null,
      grandTotal: null,
      totalAmount: 0,
      terms: null,
      notes: null,
      supplier: null,
      store: null,
      purchaseRequest: null,
      goodsReceipts: null,
      createdBy: null,
      updatedBy: null,
      approvedBy: null,
      approvedAt: null,
      vendorAcceptedBy: null,
      vendorAcceptedAt: null,
      createdAt: null,
      updatedAt: null,
      items: [
        {
          itemName: "Item A",
          itemCode: null,
          category: null,
          brand: null,
          model: null,
          specification: null,
          hsCode: null,
          unit: null,
          quantity: 10,
          unitPrice: 100,
          discountAmount: null,
          discountPercent: null,
          taxableAmount: null,
          taxPercent: null,
          taxAmount: null,
          otherCharges: null,
          lineTotal: 1000,
          totalPrice: 1000,
          receivedQuantity: null,
          expectedDelivery: null,
          batchRequired: false,
          expiryRequired: false,
          sterilityRequired: false,
          coldChainRequired: false,
          temperatureRequirement: null,
          warrantyRequired: false,
          calibrationRequired: false,
          installationRequired: false,
          trainingRequired: false,
          criticality: null,
        },
      ],
    };
    const buffer = buildPurchaseOrderPdf(
      minimalOrder,
      { name: "Test Hospital" },
      "test",
    );
    const content = buffer.toString("latin1");
    expect(content.startsWith("%PDF-1.4")).toBe(true);
    expect(content).toContain("Test Hospital");
    expect(content).toContain("PO-20260915-0099");
    expect(content).toContain("Item A");
    expect(content).toContain("GRAND TOTAL");
  });

  it("produces a multi-page PDF when content overflows a single page", () => {
    const manyItems = Array.from({ length: 60 }, (_, i) => ({
      itemName: `Bulk item ${i + 1}: Long description for line item number ${i + 1} of sixty with brand model and specification details`,
      itemCode: `ITEM-${String(i + 1).padStart(3, "0")}`,
      category: "CONSUMABLE",
      brand: "Generic",
      model: "M" + i,
      specification: "Spec detail " + i,
      hsCode: "0000.00.00",
      unit: "Unit",
      quantity: (i + 1) * 10,
      unitPrice: 100 + i,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: (i + 1) * 1000,
      taxPercent: 13,
      taxAmount: (i + 1) * 130,
      otherCharges: 0,
      lineTotal: (i + 1) * 1130,
      totalPrice: (i + 1) * 1130,
      receivedQuantity: null,
      expectedDelivery: null,
      batchRequired: true,
      expiryRequired: true,
      sterilityRequired: false,
      coldChainRequired: false,
      temperatureRequirement: null,
      warrantyRequired: false,
      calibrationRequired: false,
      installationRequired: false,
      trainingRequired: false,
      criticality: "HIGH",
    }));
    const buffer = buildPurchaseOrderPdf(
      { ...order, items: manyItems },
      tenant,
      "Admin User",
    );
    const content = buffer.toString("latin1");
    const pageCount = (content.match(/\/Type \/Page /g) || []).length;
    expect(pageCount).toBeGreaterThanOrEqual(3);
  });
});
