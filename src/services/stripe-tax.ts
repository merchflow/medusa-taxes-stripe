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
import { LineAllocationsMap } from "@medusajs/medusa/dist/types/totals";
import { ICacheService } from "@medusajs/types";
import Stripe from "stripe";
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
    super(container);
    this.cartService = container.cartService;
    this.cacheService = container.cacheService;
    this.stripeService = container.stripeService;
    this.orderService = container.orderService;
  }

  /**
   * Main service function that resolves the tax lines for a cart. It uses Stripe Tax API to calculate Sales Tax for a given address
   * and caches the result to avoid multiple calls (stripe api charges per request). It also updates cart's metadata with the calculation id
   * so we can create a tax transaction later on.
   * @param itemLines cart items
   * @param shippingLines shipping options
   * @param context context to get region and address from
   * @returns
   */
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
      const taxBreakdown = item.tax_breakdown || [];
      return {
        rate: +taxBreakdown[0]?.tax_rate_details?.percentage_decimal || 0,
        name: "Sales Tax",
        code: item.tax_code,
        item_id: l.item.id,
        metadata: { taxCalculationId: taxCalculation.id },
      };
    });

    taxLines = taxLines.concat(
      shippingLines.flatMap((l) => {
        const taxBreakdown = taxCalculation.shipping_cost?.tax_breakdown || [];
        return l.rates.map((r) => ({
          rate: +taxBreakdown[0]?.tax_rate_details?.percentage_decimal || 0,
          name: r.name,
          code: taxCalculation.shipping_cost?.tax_code,
          shipping_method_id: l.shipping_method.id,
        }));
      })
    );

    return taxLines;
  }

  /**
   * Return empty tax lines for a given itemLines array
   * @param itemLines itemLines to loop over so we return an array with same length
   * @returns tax lines for the array
   */
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

  /**
   * Creates a tax transaction from the taxCalculation stored in cart's metadata. If successful, saves the transaction id in cart's metadata.
   * @param paymentIntent Intent returned from Stripe so we can get the cart's id
   * @returns created tax transaction
   */
  public async createTaxTransaction(paymentIntent: Stripe.PaymentIntent) {
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
  }

  /**
   * Creates a Stripe reversal transaction for a refund and stores its id in order's metadata.
   * @param orderId the order id from the refund
   * @param refundId the refund id provided by Medusa
   * @returns
   */
  public handleOrderRefund = async (orderId: string, refundId: string) => {
    const order = await this.orderService.retrieve(orderId);

    if (!order) throw new Error(`Order ${orderId} not found`);
    if (!order.metadata?.taxTransactionId)
      throw new Error(
        `Order ${orderId} must have 'metadata.taxTransactionId'.`
      );

    const reversalTaxTransaction = await this.stripeService.createReversal(
      order.metadata.taxTransactionId as string,
      refundId
    );

    const updatedOrder = await this.orderService.update(orderId, {
      metadata: { reversalTransaction: reversalTaxTransaction.id },
    });

    return updatedOrder;
  };

  /**
   * Parses itemLines from medusa to Stripe.
   * @param itemLines itemLines from Medusa
   * @param allocation_map given discounts are stored in this param
   * @param taxCode taxCode to provide to Stripe
   * @returns
   */
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

  /**
   * Validates received params so that we only call stripe API if they are valid.
   * @param calculationContext context to get address and region from
   * @param items itemLines to check if it's not empty
   * @returns true if valid, false otherwise
   */
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

  /**
   * Call Stripe Tax API for the given address and caches the result.
   * @param address formatted address to call stripe api
   * @param currency currency used
   * @param lineItems formatted lineItems for stripe calculation
   * @param shippingCost shipping cost for stripe calculation
   * @returns fetched or cached transaction from stripe
   */
  private fetchTaxCalculation = async (
    address: StripeAddressType,
    currency: string,
    lineItems: LineItemStripeType[],
    shippingCost: number
  ): Promise<Stripe.Response<Stripe.Tax.Calculation>> => {
    const addressString = this.buildCacheKey(address, lineItems, shippingCost);

    if (process.env.NODE_ENV !== "test") {
      const cachedTaxRate = (await this.cacheService.get(
        addressString
      )) as Stripe.Response<Stripe.Tax.Calculation>;
      if (cachedTaxRate) return cachedTaxRate;
    }

    const calculation = await this.stripeService.fetchTaxCalculation(
      address,
      currency,
      lineItems,
      shippingCost
    );

    if (this.cacheService) {
      await this.cacheService.set(addressString, calculation, 3600); // 1 hour ttl
    }

    return calculation;
  };

  /**
   * Builds a string with the given address to be used as the cache key.
   * Be aware that updating the key may change how many times the stripe api is called.
   * @param address address from stripe
   * @param lineItems formatted stripe lineItems
   * @param shippingCost shipping cost
   * @returns string to be used as the cache key
   */
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

  /**
   * Parses an address from medusa to stripe
   * @param shipping_address shipping address object from medusa
   * @returns formatted stripe address
   */
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
