import * as path from "path";
import setupTestServer from "../../lib/setup-server";
import { initDb } from "../../lib/use-db";
import { mocks } from "../__mocks__/mocks";
import StripeService from "../stripe";
import StripeTaxService from "../stripe-tax";

jest.mock("stripe", () => {
  return {
    default: jest.fn().mockImplementation(() => {
      return {
        tax: {
          calculations: {
            create: () => Promise.resolve(mocks.stripeApi.taxCalculationWithNoTaxes),
          },
          transactions: {
            createFromCalculation: () =>
              Promise.resolve(mocks.stripeApi.taxTransaction),
            createReversal: () =>
              Promise.resolve(mocks.stripeApi.taxReversalTransaction),
          },
        },
        isMock: true
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
describe("StripeTaxService - No Tax", () => {
  let stripeTaxService: StripeTaxService;
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    medusaProcess.kill();
  });

  it("should return tax lines with rate = 0 if there's no tax_rate_details", async () => {
    const itemLines = [mocks.itemTaxCalculation];

    const calculationContext = {
      region: mocks.region,
      customer: {},
      allocation_map: {},
      shipping_address: mocks.taxCalculationShippingAddress,
      shipping_methods: [],
    };

    const taxLines = await stripeTaxService.getTaxLines(
      itemLines as any,
      [],
      calculationContext as any
    );

    const expected = [
      {
        rate: 0,
        name: "Sales Tax",
        code: "txcd_99999999",
        item_id: "item_1",
        metadata: {
          taxCalculationId: mocks.stripeApi.taxCalculationWithNoTaxes.id,
        },
      },
    ];

    expect(taxLines).toEqual(expected);
  });
});
