import { medusaInitialize } from "../../lib/spawn-medusa";
import { mocks } from "../__mocks__/mocks";

jest.mock("stripe", () => {
  return {
    default: jest.fn().mockImplementation(() => {
      return {
        tax: {
          calculations: {
            create: jest
              .fn()
              .mockResolvedValue(mocks.stripeApi.taxCalculationWithNoTaxes),
          },
          transactions: {
            createFromCalculation: () =>
              Promise.resolve(mocks.stripeApi.taxTransaction),
            createReversal: () => Promise.resolve(mocks.stripeApi.taxReversalTransaction),
          },
        },
      };
    }),
  };
});

describe("StripeTaxService - No Tax", () => {
  let stripeTaxService;

  beforeAll(async () => {
    const { container } = await medusaInitialize();

    stripeTaxService = await container.resolve("stripeTaxService");
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
        metadata: { taxCalculationId: mocks.stripeApi.taxCalculationWithNoTaxes.id },
      },
    ];

    expect(taxLines).toEqual(expected);
  });
});
