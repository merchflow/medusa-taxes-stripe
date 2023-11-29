import {
  AbstractTaxService,
  Address,
  CartService,
  ItemTaxCalculationLine,
  OrderService,
  ShippingTaxCalculationLine,
  TaxCalculationContext,
} from "@medusajs/medusa";
import { ProviderTaxLine } from "@medusajs/medusa/dist/types/tax-service";
import Stripe from "stripe";
import { ICacheService } from "@medusajs/types";
import { LineAllocationsMap } from "@medusajs/medusa/dist/types/totals";
import StripeService from "./stripe";

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

class StripeTaxService extends AbstractTaxService {
  static identifier = "stripe-tax";
  protected readonly cartService: CartService;
  protected readonly cacheService: ICacheService;
  protected readonly stripeService: StripeService;
  protected readonly orderService: OrderService;

  constructor(container) {
    super();
    this.cartService = container.cartService;
    this.cacheService = container.cacheService;
    this.stripeService = container.stripeService;
    this.orderService = container.orderService;
    // console.log(container.stripeService);
  }

  async getTaxLines(
    itemLines: ItemTaxCalculationLine[],
    shippingLines: ShippingTaxCalculationLine[],
    context: TaxCalculationContext
  ): Promise<ProviderTaxLine[]> {
    const { region, shipping_address } = context;

    if (!this.validateItemsForTaxCalculation(context, itemLines)) {
      return this.getEmptyTaxLines(itemLines);
    }
    const lineItems = this.buildStripeLineItems(
      itemLines,
      context.allocation_map,
      region.tax_code
    );
    const address = this.buildStripeAddress(shipping_address);

    const shippingCost = context.shipping_methods.reduce(
      (cost, method) => method.price + cost,
      0
    );

    const taxCalculation = await this.fetchTaxCalculation(
      address,
      region.currency_code,
      lineItems,
      shippingCost
    );

    const cartId = itemLines[0].item.cart_id;
    if (cartId) {
      await this.cartService.update(cartId, {
        metadata: { taxCalculationId: taxCalculation.id },
      });
    }

    let taxLines: ProviderTaxLine[] = itemLines.flatMap((l) => {
      const item = taxCalculation.line_items.data.find(
        (d) => d.reference === `${l.item.title} - ${l.item.id}`
      );
      return {
        rate: +item.tax_breakdown[0].tax_rate_details.percentage_decimal || 0,
        name: "Sales Tax",
        code: item.tax_code,
        item_id: l.item.id,
        metadata: { taxCalculationId: taxCalculation.id },
      };
    });

    taxLines = taxLines.concat(
      shippingLines.flatMap((l) => {
        return l.rates.map((r) => ({
          rate: r.rate || 0,
          name: r.name,
          code: r.code,
          shipping_method_id: l.shipping_method.id,
        }));
      })
    );

    return taxLines;
  }

  private getEmptyTaxLines = (itemLines: ItemTaxCalculationLine[]) => {
    return itemLines.flatMap((l) => {
      return l.rates.map((r) => ({
        rate: 0,
        name: r.name,
        code: r.code,
        item_id: l.item.id,
      }));
    });
  };

  public createTaxTransaction = async (paymentIntent: Stripe.PaymentIntent) => {
    const cartId: string = paymentIntent.metadata.resource_id;

    if (!cartId) throw new Error("metadata.resource_id is required");

    const cart = await this.cartService.retrieve(cartId);

    const taxCalculationId: string = cart.metadata.taxCalculationId as string;

    const transaction = await this.stripeService.createFromCalculation(
      taxCalculationId,
      paymentIntent.id
    );

    await this.cartService.update(cartId, {
      metadata: {
        taxTransactionId: transaction.id,
        paymentIntent: paymentIntent.id,
        taxReference: transaction.reference,
      },
    });

    return transaction;
  };

  public handleOrderRefund = async (orderId: string, refundId: string) => {
    const order = await this.orderService.retrieve(orderId);

    if (!order || !order.metadata?.taxTransactionId)
      throw new Error(`Order ${orderId} not found`);

    const reversalTaxTransaction = await this.stripeService.createReversal(
      order.metadata.taxTransactionId as string,
      refundId
    );

    console.log('AAA')

    const updatedOrder = await this.orderService.update(orderId, {
      metadata: { reversalTransaction: reversalTaxTransaction.id },
    });

    return updatedOrder;
  }

  private buildStripeLineItems = (
    itemLines: ItemTaxCalculationLine[],
    allocation_map: LineAllocationsMap,
    taxCode: string
  ) => {
    return itemLines.map(({ item }) => {
      const allocations = allocation_map[item.id] || {};
      const itemDiscount = allocations.discount?.amount ?? 0;
      return {
        amount: item.unit_price * item.quantity - itemDiscount,
        tax_code: taxCode,
        reference: `${item.title} - ${item.id}`,
      };
    });
  };

  private validateItemsForTaxCalculation = (
    calculationContext: TaxCalculationContext,
    items: ItemTaxCalculationLine[]
  ): boolean => {
    const { shipping_address, region } = calculationContext;
    if (
      !shipping_address?.postal_code ||
      !shipping_address?.address_1 ||
      !shipping_address?.city ||
      !shipping_address?.province ||
      !shipping_address?.country_code ||
      !items?.length ||
      !region
    ) {
      return false;
    }
    return true;
  };

  private fetchTaxCalculation = async (
    address: StripeAddressType,
    currency: string,
    lineItems: LineItemStripeType[],
    shippingCost: number
  ): Promise<Stripe.Response<Stripe.Tax.Calculation>> => {
    const addressString = this.buildCacheKey(address, lineItems, shippingCost);
    const cachedTaxRate = (await this.cacheService.get(
      addressString
    )) as Stripe.Response<Stripe.Tax.Calculation>;
    if (cachedTaxRate) return cachedTaxRate;

    const calculation = await this.stripeService.fetchTaxCalculation(
      address,
      currency,
      lineItems,
      shippingCost
    );

    await this.cacheService.set(addressString, calculation, 3600); // 1 hour ttl

    return calculation;
  };

  private buildCacheKey = (
    address: StripeAddressType,
    lineItems: LineItemStripeType[],
    shippingCost: number
  ) => {
    const addressString = [
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postal_code,
      address.country,
    ].join(" ");
    return (
      "stripe_tax_api:" +
      JSON.stringify({ addressString, lineItems, shippingCost })
    );
  };

  private buildStripeAddress = (
    shipping_address: Address
  ): StripeAddressType => {
    return {
      line1: shipping_address.address_1,
      line2: shipping_address.address_2,
      city: shipping_address.city,
      state: shipping_address.province,
      postal_code: shipping_address.postal_code,
      country: shipping_address.country_code,
    };
  };
}

export default StripeTaxService;
