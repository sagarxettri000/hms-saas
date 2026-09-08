import * as net from "net";

export interface EchoResult {
  reachable: boolean;
  latencyMs: number | null;
}

export function isTcpReachable(hostname: string, port: number, timeoutMs = 4000): Promise<EchoResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();

    const finish = (reachable: boolean) => {
      socket.destroy();
      resolve({ reachable, latencyMs: reachable ? Date.now() - start : null });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, hostname);
  });
}