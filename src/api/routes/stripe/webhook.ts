import { wrapHandler } from "@medusajs/medusa";
import { NextFunction, Request, Response, Router, raw } from "express";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_API_KEY);

interface RawRequest extends Request {
  parsedBody: { data: { object: any }; type: string };
}

const verifySignature =
  (endpointSecret: string) =>
  (req: RawRequest, res: Response, next: NextFunction) => {
    const signature = req.get("stripe-signature");

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        endpointSecret
      );
      req.parsedBody = event;
      next();
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  };

export default function getStoreRouter(router: Router, options: Record<string, any>): Router {
  const { webhookSecret, projectConfig } = options;
  router.post(
    "/stripe/webhook",
    raw({ type: "application/json" }),
    verifySignature(webhookSecret || projectConfig.webhookSecret),
    wrapHandler(
      async (
        req: RawRequest,
        res: Response
      ): Promise<void> => {
        const { data, type } = req.parsedBody;

        const stripeTaxService = req.scope.resolve("stripeTaxService");

        const eventToServiceMap = {
          "payment_intent.succeeded": stripeTaxService.createTaxTransaction,
        };

        const eventHandler = eventToServiceMap[type];
        if (eventHandler) {
          const transaction = await eventHandler(data.object);
          res.json(transaction);
        } else {
          res.status(400).send(`Event ${type} not mapped`);
        }
      }
    )
  );

  return router;
}
