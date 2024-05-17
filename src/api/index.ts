import * as express from "express";
import { Router } from "express";
import StripeWebhookRouter from "./routes/stripe/webhook";

export default (rootDirectory: string): Router | Router[] => {
  const router = Router()

  // router.use(express.json()) // not allowed here since it breaks stripe's signature validation
  router.use(express.urlencoded({ extended: true }))

  StripeWebhookRouter(router)

  return router;
}
