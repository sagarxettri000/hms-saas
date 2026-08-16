import { of, throwError } from "rxjs";
import { RequestLoggerInterceptor } from "./request-logger.interceptor";

describe("RequestLoggerInterceptor", () => {
  const interceptor = new RequestLoggerInterceptor();
  const loggerSpy = jest
    .spyOn((interceptor as any).logger, "log")
    .mockImplementation(() => {});
  const warnSpy = jest
    .spyOn((interceptor as any).logger, "warn")
    .mockImplementation(() => {});
  const errorSpy = jest
    .spyOn((interceptor as any).logger, "error")
    .mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeContext(overrides: any = {}) {
    const req: any = {
      method: "GET",
      originalUrl: "/api/v1/patients",
      url: "/api/v1/patients",
      ip: "127.0.0.1",
      headers: {},
      correlationId: "corr-1",
      ...overrides,
    };
    const res: any = { statusCode: 200 };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as any;
  }

  it("logs a successful request with metadata", (done) => {
    interceptor
      .intercept(makeContext(), { handle: () => of({ ok: true }) } as any)
      .subscribe(() => {
        expect(loggerSpy).toHaveBeenCalledTimes(1);
        const [msg, meta] = loggerSpy.mock.calls[0] as [string, any];
        expect(msg).toContain("GET /api/v1/patients 200");
        expect(meta).toMatchObject({
          correlationId: "corr-1",
          method: "GET",
          path: "/api/v1/patients",
          status: 200,
        });
        expect(meta.durationMs).toBeGreaterThanOrEqual(0);
        done();
      });
  });

  it("includes userId/tenantId when the user is attached", (done) => {
    interceptor
      .intercept(
        makeContext({ user: { id: "u1", tenantId: "t1", role: "DOCTOR" } }),
        { handle: () => of({}) } as any,
      )
      .subscribe(() => {
        const meta = loggerSpy.mock.calls[0][1] as any;
        expect(meta).toMatchObject({ userId: "u1", tenantId: "t1", role: "DOCTOR" });
        done();
      });
  });

  it("logs 4xx responses at warn level", (done) => {
    const context = makeContext();
    context.switchToHttp().getResponse().statusCode = 404;
    interceptor
      .intercept(context, {
        handle: () => throwError(() => ({ status: 404, message: "Not found" })),
      } as any)
      .subscribe({
        error: () => {
          expect(warnSpy).toHaveBeenCalledTimes(1);
          const [msg, meta] = warnSpy.mock.calls[0] as [string, any];
          expect(msg).toContain("404");
          expect(meta.error).toBe("Not found");
          done();
        },
      });
  });

  it("logs 5xx responses at error level", (done) => {
    const context = makeContext();
    context.switchToHttp().getResponse().statusCode = 500;
    interceptor
      .intercept(context, {
        handle: () => throwError(() => ({ status: 500, message: "Boom" })),
      } as any)
      .subscribe({
        error: () => {
          expect(errorSpy).toHaveBeenCalledTimes(1);
          expect(errorSpy.mock.calls[0][0]).toContain("500");
          done();
        },
      });
  });
});
