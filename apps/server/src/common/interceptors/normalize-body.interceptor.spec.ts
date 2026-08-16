import { NormalizeBodyInterceptor } from "./normalize-body.interceptor";

describe("NormalizeBodyInterceptor", () => {
  const interceptor = new NormalizeBodyInterceptor();

  function run(body: any) {
    const request: any = { body };
    const next = { handle: jest.fn(() => ({ pipe: jest.fn() })) };
    interceptor.intercept(
      { switchToHttp: () => ({ getRequest: () => request }) } as any,
      next as any,
    );
    return request.body;
  }

  it("converts empty-string FK fields to null", () => {
    const body = run({ patientId: "p1", encounterId: "", admissionId: "" });
    expect(body.encounterId).toBeNull();
    expect(body.admissionId).toBeNull();
    expect(body.patientId).toBe("p1");
  });

  it("keeps non-empty strings unchanged", () => {
    const body = run({ name: "Dr X", notes: "stable", encounterId: "e1" });
    expect(body).toEqual({ name: "Dr X", notes: "stable", encounterId: "e1" });
  });

  it("recursively normalizes nested FK fields", () => {
    const body = run({
      items: [
        { medicineId: "", dosage: "1-1-1" },
        { medicineId: "m1", dosage: "" },
      ],
    });
    expect(body.items[0].medicineId).toBeNull();
    expect(body.items[0].dosage).toBe("1-1-1");
    expect(body.items[1].medicineId).toBe("m1");
    expect(body.items[1].dosage).toBe("");
  });

  it("does not blank required text fields", () => {
    const body = run({ name: "", code: "" });
    expect(body.name).toBe("");
    expect(body.code).toBe("");
  });

  it("handles missing body gracefully", () => {
    const request: any = {};
    const next = { handle: jest.fn(() => ({ pipe: jest.fn() })) };
    interceptor.intercept(
      { switchToHttp: () => ({ getRequest: () => request }) } as any,
      next as any,
    );
    expect(request.body).toBeUndefined();
  });
});