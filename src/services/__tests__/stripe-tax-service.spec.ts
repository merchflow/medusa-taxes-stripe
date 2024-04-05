import {
  CartService,
  RegionService
} from "@medusajs/medusa";
import CustomerRepository from "@medusajs/medusa/dist/repositories/customer";
import OrderRepository from "@medusajs/medusa/dist/repositories/order";
import * as path from "path";
import setupTestServer from "../../lib/setup-server";
import { initDb } from "../../lib/use-db";
import {
  mocks,
} from "../__mocks__/mocks";
import StripeService from "../stripe";
import StripeTaxService from "../stripe-tax";

jest.mock("stripe", () => {
  return {
    default: jest.fn().mockImplementation(() => {
      return {
        tax: {
          calculations: { create: () => Promise.resolve(mocks.stripeApi.taxCalculation) },
          transactions: {
            createFromCalculation: jest.fn().mockResolvedValue(mocks.stripeApi.taxTransaction),
            createReversal: jest.fn().mockResolvedValue(mocks.stripeApi.taxReversalTransaction),
          },
        },
      };
    }),
  };
});

/**
 * README: Tests are currently broken since Medusa team committed something in the 1.18 version that caused an error with dependencies.
 * We're waiting for them to launch an official way for integration tests to run.
 * 
 * If you want to take a shot fixing it, the server and dbConnection are currently working fine, but the returned medusa container doesn't 
 * have the 'resolve' function for some reason, meaning that we're not able to use its services.
 */
describe("StripeTaxService", () => {
  let stripeTaxService;
  let cartService: CartService;
  let regionService: RegionService;
  let orderRepository: typeof OrderRepository;
  let customerRepository: typeof CustomerRepository;
  let dbConnection;
  let medusaProcess;

  beforeAll(async () => {
    const cwd = path.resolve(path.join(__dirname, "..", ".."));
    dbConnection = await initDb({ cwd });
    const { medusaProcess: medusaProcess_, container } = await setupTestServer({
      cwd,
      verbose: true,
    });
    medusaProcess = medusaProcess_;
    stripeTaxService = new StripeTaxService({
      ...container,
      stripeService: new StripeService(container, {})
    });

    cartService = container['cartService'];
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    medusaProcess.kill();
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
