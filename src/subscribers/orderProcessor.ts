import { OrderService } from "@medusajs/medusa";
import StripeTaxService from "services/stripe-tax";

class OrderProcessorSubscriber {
  private stripeTaxService: StripeTaxService;

  constructor(container) {
    this.stripeTaxService = container.stripeTaxService;

    container.eventBusService.subscribe(
      OrderService.Events.REFUND_CREATED,
      this.handleRefund
    );
  }

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
