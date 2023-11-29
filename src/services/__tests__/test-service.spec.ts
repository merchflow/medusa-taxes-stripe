import { medusaInitialize } from "../../lib/spawn-medusa";
import {
  CartService,
  LineItemService,
  MedusaContainer,
  OrderService,
  RegionService,
} from "@medusajs/medusa";
import {
  customerMock,
  itemTaxCalculationMock,
  orderMock,
  regionMock,
  stripeMockService,
  stripePaymentIntentMock,
  stripeTaxReversalMock,
  stripeTaxTransactionMock,
  taxCalculationShippingAddressMock,
} from "../__mocks__/mocks";
import { asValue, createContainer } from "awilix";
import StripeTaxService from "../stripe-tax";
import { createMedusaContainer } from "medusa-core-utils";
import OrderRepository from "@medusajs/medusa/dist/repositories/order";
import CustomerRepository from "@medusajs/medusa/dist/repositories/customer";

describe("MyService", () => {
  let defaultContainer: MedusaContainer;
  let stripeTaxService;
  let cartService: CartService;
  let regionService: RegionService;
  let orderRepository: typeof OrderRepository;
  let customerRepository: typeof CustomerRepository;

  beforeAll(async () => {
    const medusa = await medusaInitialize();
    defaultContainer = medusa.container;
    stripeTaxService = await defaultContainer.resolve("stripeTaxService");
    stripeTaxService.stripeService = stripeMockService();

    cartService = defaultContainer.resolve("cartService");
    regionService = defaultContainer.resolve("regionService");
    orderRepository = defaultContainer.resolve("orderRepository");
    customerRepository = defaultContainer.resolve("customerRepository");
  });

  it("should return tax lines for lineItems", async () => {
    const itemLines = [itemTaxCalculationMock];

    const calculationContext = {
      region: regionMock,
      customer: {},
      allocation_map: {},
      shipping_address: taxCalculationShippingAddressMock,
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
    const itemTaxes = [itemTaxCalculationMock];

    const calculationContext = {
      region: regionMock,
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
        ...itemTaxCalculationMock,
        item: {
          ...itemTaxCalculationMock.item,
          cart_id: cart.id,
        },
      },
    ];

    const calculationContext = {
      region: regionMock,
      customer: {},
      allocation_map: {},
      shipping_address: taxCalculationShippingAddressMock,
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
      ...stripePaymentIntentMock,
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
      ...stripePaymentIntentMock,
      metadata: { resource_id: cart.id },
    });

    const updatedCart = await cartService.retrieve(cart.id);

    expect(updatedCart).toHaveProperty("metadata");
    expect(updatedCart.metadata.taxTransactionId).toEqual(
      stripeTaxTransactionMock.id
    );
    expect(updatedCart.metadata.paymentIntent).toEqual(
      stripePaymentIntentMock.id
    );
    expect(updatedCart.metadata.taxReference).toEqual(
      stripeTaxTransactionMock.reference
    );
  });

  it("should create tax transaction on refund", async () => {
    const region = await regionService.retrieveByName("NA");

    await customerRepository.insert(customerMock);

    const order = {
      ...orderMock,
      customer_id: customerMock.id,
      email: customerMock.email,
      region_id: region.id,
    };
    await orderRepository.insert(order);
    const updatedOrder = await stripeTaxService.handleOrderRefund(
      order.id,
      "ref_1"
    );

    expect(updatedOrder).toHaveProperty("metadata");
    expect(updatedOrder.metadata).toHaveProperty("reversalTransaction");
    expect(updatedOrder.metadata.reversalTransaction).toEqual(
      stripeTaxReversalMock.id
    );
  });
});
