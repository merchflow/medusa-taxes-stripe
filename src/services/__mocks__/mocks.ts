export const mocks = {
  stripeApi: {
    paymentIntent: {
      id: "pi_3OG0NVFdhu7VaE8e1e5W9GRa",
      object: "payment_intent",
      amount: 2000,
      metadata: { resource_id: "cart_01HFZ117Q5EC3GTVP835H1H6CT" },
    },
    taxCalculation: {
      id: "taxcalc_1OHDq4Fdhu7VaE8eGQEgPOer",
      expires_at: 1701297705,
      line_items: {
        object: "list",
        data: [
          {
            id: "tax_li_P5OgFRyYZa3JF8",
            object: "tax.calculation_line_item",
            amount: 10,
            amount_tax: 1,
            livemode: false,
            product: null,
            quantity: 1,
            reference: "item_title_1 - item_1",
            tax_behavior: "exclusive",
            tax_breakdown: [
              {
                amount: 1,
                jurisdiction: {
                  country: "US",
                  display_name: "Michigan",
                  level: "state",
                  state: "MI",
                },
                sourcing: "destination",
                tax_rate_details: {
                  display_name: "Sales and Use Tax",
                  percentage_decimal: "6.0",
                  tax_type: "sales_tax",
                },
                taxability_reason: "standard_rated",
                taxable_amount: 10,
              },
            ],
            tax_code: "txcd_99999999",
          },
        ],
        has_more: false,
        total_count: 1,
        url: "/v1/tax/calculations/taxcalc_1OHDq4Fdhu7VaE8eGQEgPOer/line_items",
      },
    },
    taxCalculationWithNoTaxes:{
      id: "taxcalc_stripeCalcWithNoTaxesMock",
      expires_at: 1701297705,
      line_items: {
        object: "list",
        data: [
          {
            id: "tax_li_P5OgFRyYZa3JF8",
            object: "tax.calculation_line_item",
            amount: 10,
            amount_tax: 1,
            livemode: false,
            product: null,
            quantity: 1,
            reference: "item_title_1 - item_1",
            tax_behavior: "exclusive",
            tax_breakdown: [
              {
                amount: 0,
                jurisdiction: {
                  country: "US",
                  display_name: "Michigan",
                  level: "state",
                  state: "MI",
                },
                sourcing: "destination",
                tax_rate_details: null,
                taxability_reason: "not_collecting",
                taxable_amount: 0,
              },
            ],
            tax_code: "txcd_99999999",
          },
        ],
        has_more: false,
        total_count: 1,
        url: "/v1/tax/calculations/taxcalc_1OHDq4Fdhu7VaE8eGQEgPOer/line_items",
      },
    },
    taxTransaction: {
      id: "tax_1OG5mPFdhu7VaE8eAm8bnyRj",
      object: "tax.transaction",
      created: 1700856934,
      currency: "usd",
      customer: null,
      livemode: false,
      metadata: {},
      reference: "pi_3OG5mQFdhu7VaE8e06Lz12S4",
      reversal: null,
      tax_date: 1700856913,
      type: "transaction",
    },
    taxReversalTransaction: {
      id: "tax_1OG5piFdhu7VaE8eVE7uhj52",
      object: "tax.transaction",
      metadata: {},
      reference: "ref_01HG1FQX5F1EHABE92D33H4VM3",
      reversal: {
        original_transaction: "tax_1OG5mPFdhu7VaE8eAm8bnyRj",
      },
      tax_date: 1700856913,
      type: "reversal",
    }
  },

  taxCalculationShippingAddress: {
    address_1: "5242 Alpine Ave",
    city: "NW Comstock Park",
    province: "MI",
    postal_code: "49321",
    country_code: "us",
  },

  itemTaxCalculation: {
    item: {
      id: "item_1",
      title: "item_title_1",
      unit_price: 10,
      quantity: 1,
      variant: {
        product_id: "product_1",
      },
    },
    rates: [],
  },

  region: {
    name: "NA",
    currency_code: "usd",
    tax_rate: 0,
    tax_code: "txcd_99999999",
    payment_providers: ["stripe"],
    fulfillment_providers: [],
    countries: ["US"],
  },

  customer: {
    id: "cus_fake",
    email: "test@order.com",
  },

  order: {
    id: "ord_fake",
    total: 0,
    currency_code: "usd",
    metadata: { taxTransactionId: 'tax_1OG5mPFdhu7VaE8eAm8bnyRj' },
  }
};
