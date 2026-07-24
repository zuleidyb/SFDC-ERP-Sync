public with sharing class OrderTriggerHandler {
  public static final String STATUS_SHIPPED = 'Shipped';

  public static void preventShippingWithoutErpSync(
    List<Order__c> newOrders,
    Map<Id, Order__c> oldMap
  ) {
    for (Order__c order : newOrders) {
      Order__c oldOrder = oldMap.get(order.Id);

      Boolean movingToShipped =
        order.Status__c == STATUS_SHIPPED &&
        oldOrder.Status__c != STATUS_SHIPPED;

      if (movingToShipped && String.isBlank(order.ERP_Order_Id__c)) {
        order.Status__c.addError(
          'This order cannot be marked Shipped until it has synced to the ERP (ERP_Order_Id__c is blank).'
        );
      }
    }
  }
}
