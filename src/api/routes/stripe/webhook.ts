import { Request, Response, Router } from "express";
import * as bodyParser from "body-parser";
import { wrapHandler } from "@medusajs/medusa";

export default function getStoreRouter(router: Router): Router {
  router.use(bodyParser.json());

  router.post(
    "/stripe/webhook",
    wrapHandler(async (req: Request, res: Response): Promise<void> => {
      const { data, type } = req.body;

      const stripeTaxService = req.scope.resolve("stripeTaxService");

      const eventToServiceMap = {
        "payment_intent.succeeded": stripeTaxService.createTaxTransaction,
      };

      const eventHandler = eventToServiceMap[type];
      if (eventHandler) {
        const transaction = await eventHandler(data.object);
        res.sendStatus(200).json(transaction);
      } else {
				res.status(400).send(`Event ${type} not mapped`);
			}
    })
  );

  return router;
}
