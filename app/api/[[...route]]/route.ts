
import { Hono } from "hono"
import { handle } from "hono/vercel";
import accounts from "./accounts";
import categories from "./categories";
import transactions from "./transactions";
import summary from "./summary";
import pendingTransactions from "./pending-transactions";
import smsRules from "./sms-rules";
import widget from "./widget";
import push from "./push";



// Node.js runtime, not Edge: Edge Functions must begin sending a response
// within 25s (hard platform cap, not configurable), and Hermes-backed
// extraction (voice/SMS/vision) routinely takes longer than that once
// transcription + retries are included. Node functions default to a much
// lower cap on Hobby plans, so it's raised explicitly below.
export const runtime = 'nodejs';
export const maxDuration = 60;

const app = new Hono().basePath('/api');



const routes = app
  .route("/summary", summary)
  .route("/accounts", accounts)
  .route("/categories", categories)
  .route("/transactions", transactions)
  .route("/pending-transactions", pendingTransactions)
  .route("/sms-rules", smsRules)
  .route("/widget", widget)
  .route("/push", push)

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;