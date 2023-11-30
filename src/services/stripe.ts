import { TransactionBaseService } from "@medusajs/medusa";
import Stripe from "stripe";

type StripeAddressType = {
  line1: string;
  line2?: string | undefined;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

type LineItemStripeType = {
  amount: number;
  tax_code: string;
  reference: string;
};

class StripeService extends TransactionBaseService {
  static identifier = "stripe";
  private stripe: Stripe;

  constructor(container, options) {
    super(container);
    const { stripeApiKey } = options;
    this.stripe = new Stripe(stripeApiKey, {
      apiVersion: "2023-10-16",
    });
  }

  public createFromCalculation = async (
    taxCalculationId: string,
    reference: string
  ) => {
    const transaction =
      await this.stripe.tax.transactions.createFromCalculation({
        calculation: taxCalculationId,
        reference,
        expand: ["line_items"],
      });

    return transaction;
  };

  public fetchTaxCalculation = async (
    address: StripeAddressType,
    currency: string,
    lineItems: LineItemStripeType[],
    shippingCost: number
  ): Promise<Stripe.Response<Stripe.Tax.Calculation>> => {
    const calculation = await this.stripe.tax.calculations.create({
      currency,
      line_items: lineItems,
      customer_details: {
        address,
        address_source: "shipping",
      },
      shipping_cost: {
        amount: shippingCost,
        tax_code: "txcd_92010001",
      },
      expand: ["line_items.data.tax_breakdown"],
    });

    return calculation;
  };

  public createReversal = async (taxTransactionId: string, refundId: string) => {
    return this.stripe.tax.transactions.createReversal({
      mode: 'full',
      original_transaction: taxTransactionId,
      reference: refundId,
      expand: ['line_items'],
    });
  };
}

export default StripeService;
