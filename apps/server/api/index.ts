// Vercel lambda entry: serve the bootstrapped Nest Express app directly.
// Vercel's Node bridge invokes the default export with real (req, res).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapNest } = require("../dist/serverless.js");

let app: any;

export default async function handler(req: any, res: any) {
  app = app || (await bootstrapNest());
  return app(req, res);
}