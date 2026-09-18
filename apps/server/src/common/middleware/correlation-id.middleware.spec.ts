import {
  CorrelationIdMiddleware,
  CORRELATION_HEADER,
} from "./correlation-id.middleware";

describe("CorrelationIdMiddleware", () => {
  const middleware = new CorrelationIdMiddleware();

  it("generates a correlation id when none is provided", () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(req.correlationId).toBeTruthy();
    expect(res.setHeader).toHaveBeenCalledWith(
      CORRELATION_HEADER,
      req.correlationId,
    );
    expect(next).toHaveBeenCalled();
  });

  it("propagates an incoming correlation id", () => {
    const req: any = { headers: { [CORRELATION_HEADER]: "corr-123" } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(req.correlationId).toBe("corr-123");
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_HEADER, "corr-123");
  });

  it("generates a fresh id for a blank incoming value", () => {
    const req: any = { headers: { [CORRELATION_HEADER]: "   " } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(req.correlationId).toBeTruthy();
    expect(req.correlationId).not.toBe("   ");
  });
});
