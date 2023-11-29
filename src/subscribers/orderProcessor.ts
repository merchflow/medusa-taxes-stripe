import { OrderService } from "@medusajs/medusa";
import StripeTaxService from "services/stripe-tax";

class OrderProcessorSubscriber {
  private sendgridService;
  private stripeTaxService: StripeTaxService;

  constructor(container) {
    this.sendgridService = container.sendgridService;
    this.stripeTaxService = container.stripeTaxService;

    container.eventBusService.subscribe(OrderService.Events.PLACED, this.handleOrder);
    container.eventBusService.subscribe(
      OrderService.Events.REFUND_CREATED,
      this.handleRefund
    );
  }

  handleOrder = async (data) => {
    try {
      const order = await this.sendgridService.orderPlacedData(data);
      const sendOptions = {
        templateId: process.env.SENDGRID_ORDER_PLACED_ADMIN_ID,
        from: process.env.SENDGRID_FROM,
        to: process.env.SENDGRID_ADMIN_TO,
        dynamic_template_data: order,
      };

      await this.sendgridService.sendEmail(sendOptions);
      return;
    } catch (err) {
      console.log(err);
    }
  };

  handleRefund = async ({
    id,
    refund_id,
  }: {
    id: string;
    refund_id: string;
  }) => {
    await this.stripeTaxService.handleOrderRefund(id, refund_id);
  };
}

export default OrderProcessorSubscriber;
