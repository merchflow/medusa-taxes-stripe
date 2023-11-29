import { Router } from "express"
import StripeWebhookRouter from "./routes/stripe/webhook"
import * as express from "express";

export default (rootDirectory: string): Router | Router[] => {
  const router = Router()

  router.use(express.json())
  router.use(express.urlencoded({ extended: true }))

  StripeWebhookRouter(router)

  return router;
}
