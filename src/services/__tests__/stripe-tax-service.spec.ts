import {
  CartService,
  CustomerService,
  MedusaContainer,
  RegionService,
} from "@medusajs/medusa";
import CustomerRepository from "@medusajs/medusa/dist/repositories/customer";
import OrderRepository from "@medusajs/medusa/dist/repositories/order";
import { medusaInitialize } from "../../lib/spawn-medusa";
import {
  mocks,
} from "../__mocks__/mocks";

jest.mock("stripe", () => {
  return {
    default: jest.fn().mockImplementation(() => {
      return {
        tax: {
          calculations: { create: jest.fn().mockResolvedValue(mocks.stripeApi.taxCalculation) },
          transactions: {
            createFromCalculation: jest.fn().mockResolvedValue(mocks.stripeApi.taxTransaction),
            createReversal: jest.fn().mockResolvedValue(mocks.stripeApi.taxReversalTransaction),
          },
        },
      };
    }),
  };
});

describe("StripeTaxService", () => {
  let defaultContainer: MedusaContainer;
  let stripeTaxService;
  let cartService: CartService;
  let regionService: RegionService;
  let orderRepository: typeof OrderRepository;
  let customerRepository: typeof CustomerRepository;
  let customerService: CustomerService;

  beforeAll(async () => {
    const { container } = await medusaInitialize();
    defaultContainer = container;
    stripeTaxService = await defaultContainer.resolve("stripeTaxService");

    cartService = defaultContainer.resolve("cartService");
    regionService = defaultContainer.resolve("regionService");
    customerService = defaultContainer.resolve("customerService");

    orderRepository = defaultContainer.resolve("orderRepository");
    customerRepository = defaultContainer.resolve("customerRepository");
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return tax lines for lineItems", async () => {
    const itemLines = [mocks.itemTaxCalculation];

    const calculationContext = {
      region: mocks.region,
      customer: {},
      allocation_map: {},
      shipping_address: mocks.taxCalculationShippingAddress,
      shipping_methods: [],
    };

    const taxLines = await stripeTaxService.getTaxLines(
      itemLines,
      [],
      calculationContext
    );

    const expected = [
      {
        rate: 6,
        name: "Sales Tax",
        code: "txcd_99999999",
        item_id: "item_1",
        metadata: { taxCalculationId: "taxcalc_1OHDq4Fdhu7VaE8eGQEgPOer" },
      },
    ];

    expect(taxLines).toEqual(expected);
  });

  it("should return empty tax lines for invalid data", async () => {
    const itemTaxes = [mocks.itemTaxCalculation];

    const calculationContext = {
      region: mocks.region,
      customer: {},
      allocation_map: {},
      shipping_address: {},
      shipping_methods: [],
    };

    const taxLines = await stripeTaxService.getTaxLines(
      itemTaxes,
      [],
      calculationContext
    );

    expect(taxLines).toHaveLength(0);
  });

  it("should update cart's metadata with tax calculation id", async () => {
    const region = await regionService.retrieveByName("NA");
    const cart = await cartService.create({ region_id: region.id });

    const itemTaxes = [
      {
        ...mocks.itemTaxCalculation,
        item: {
          ...mocks.itemTaxCalculation.item,
          cart_id: cart.id,
        },
      },
    ];

    const calculationContext = {
      region: mocks.region,
      customer: {},
      allocation_map: {},
      shipping_address: mocks.taxCalculationShippingAddress,
      shipping_methods: [],
    };

    const taxLines = await stripeTaxService.getTaxLines(
      itemTaxes,
      [],
      calculationContext
    );

    const updatedCart = await cartService.retrieve(cart.id);

    expect(updatedCart).toHaveProperty("metadata");
    expect(updatedCart.metadata).toHaveProperty("taxCalculationId");
    expect(updatedCart.metadata.taxCalculationId).toEqual(
      "taxcalc_1OHDq4Fdhu7VaE8eGQEgPOer"
    );
  });

  it("should create tax transaction from calculation", async () => {
    const region = await regionService.retrieveByName("NA");
    const cart = await cartService.create({
      region_id: region.id,
      metadata: { taxCalculationId: "taxcalc_1OHDq4Fdhu7VaE8eGQEgPOer" },
    });

    const transaction = await stripeTaxService.createTaxTransaction({
      ...mocks.stripeApi.paymentIntent,
      metadata: { resource_id: cart.id },
    });

    expect(transaction).toHaveProperty("id");
  });

  it("should update cart's metadata when creating tax transaction", async () => {
    const region = await regionService.retrieveByName("NA");
    const cart = await cartService.create({
      region_id: region.id,
      metadata: { taxCalculationId: "taxcalc_1OHDq4Fdhu7VaE8eGQEgPOer" },
    });

    const transaction = await stripeTaxService.createTaxTransaction({
      ...mocks.stripeApi.paymentIntent,
      metadata: { resource_id: cart.id },
    });

    const updatedCart = await cartService.retrieve(cart.id);

    expect(updatedCart).toHaveProperty("metadata");
    expect(updatedCart.metadata.taxTransactionId).toEqual(
      mocks.stripeApi.taxTransaction.id
    );
    expect(updatedCart.metadata.paymentIntent).toEqual(
      mocks.stripeApi.paymentIntent.id
    );
    expect(updatedCart.metadata.taxReference).toEqual(
      mocks.stripeApi.taxTransaction.reference
    );
  });

  it("should create tax transaction on refund", async () => {
    const region = await regionService.retrieveByName("NA");

    const customer = await customerRepository.save(mocks.customer);

    const order = await orderRepository.save({
      ...mocks.order,
      customer_id: customer.id,
      email: customer.email,
      region_id: region.id,
    });
    const updatedOrder = await stripeTaxService.handleOrderRefund(
      order.id,
      "ref_1"
    );

    expect(updatedOrder).toHaveProperty("metadata");
    expect(updatedOrder.metadata).toHaveProperty("reversalTransaction");
    expect(updatedOrder.metadata.reversalTransaction).toEqual(
      mocks.stripeApi.taxReversalTransaction.id
    );
  });
});
