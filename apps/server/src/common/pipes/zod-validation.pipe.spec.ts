import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.number().int().min(0),
  });

  it("passes valid payload through", () => {
    const pipe = new ZodValidationPipe(schema);
    const value = { email: "test@example.com", age: 30 };
    expect(pipe.transform(value, {} as any)).toEqual(value);
  });

  it("strips unknown keys and returns parsed data", () => {
    const pipe = new ZodValidationPipe(schema);
    const result = pipe.transform(
      { email: "a@b.co", age: 1, extra: "ignored" },
      {} as any,
    );
    expect(result).toEqual({ email: "a@b.co", age: 1 });
  });

  it("throws BadRequestException with field details on invalid input", () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ email: "not-an-email", age: -5 }, {} as any);
      fail("Expected BadRequestException");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const res = (err as BadRequestException).getResponse() as any;
      expect(res.message).toBe("Validation failed");
      expect(res.details.length).toBe(2);
      expect(res.details.map((d: any) => d.field).sort()).toEqual([
        "age",
        "email",
      ]);
    }
  });
});
