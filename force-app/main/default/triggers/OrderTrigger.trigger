trigger OrderTrigger on Order__c(before update) {
  if (Trigger.isBefore && Trigger.isUpdate) {
    OrderTriggerHandler.preventShippingWithoutErpSync(
      Trigger.new,
      Trigger.oldMap
    );
  }
}
