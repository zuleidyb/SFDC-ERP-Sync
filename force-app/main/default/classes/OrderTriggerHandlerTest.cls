@isTest
private class OrderTriggerHandlerTest {
  @TestSetup
  static void setup() {
    Account acc = new Account(Name = 'Test Account');
    insert acc;

    insert new Order__c(
      Account__c = acc.Id,
      Status__c = 'New',
      Amount__c = 100
    );
  }

  @isTest
  static void testCannotShipWithoutErpOrderId() {
    Order__c order = [
      SELECT Id, Status__c, ERP_Order_Id__c
      FROM Order__c
      LIMIT 1
    ];
    order.Status__c = 'Shipped';

    Test.startTest();
    Boolean caughtException = false;
    try {
      update order;
    } catch (DmlException e) {
      caughtException = true;
      System.assert(
        e.getMessage().contains('cannot be marked Shipped'),
        'Expected error about missing ERP sync, got: ' + e.getMessage()
      );
    }
    Test.stopTest();

    System.assert(
      caughtException,
      'Expected shipping without an ERP Order Id to fail.'
    );
  }

  @isTest
  static void testCanShipWithErpOrderId() {
    Order__c order = [
      SELECT Id, Status__c, ERP_Order_Id__c
      FROM Order__c
      LIMIT 1
    ];
    order.ERP_Order_Id__c = 'ERP-ORD-TEST-001';
    order.Status__c = 'Shipped';

    Test.startTest();
    update order;
    Test.stopTest();

    Order__c updated = [SELECT Status__c FROM Order__c WHERE Id = :order.Id];
    System.assertEquals(
      'Shipped',
      updated.Status__c,
      'Order should be shippable once synced to the ERP.'
    );
  }

  @isTest
  static void testNonShippedStatusChangeDoesNotRequireErpId() {
    Order__c order = [SELECT Id, Status__c FROM Order__c LIMIT 1];
    order.Status__c = 'Processing';

    Test.startTest();
    update order;
    Test.stopTest();

    Order__c updated = [SELECT Status__c FROM Order__c WHERE Id = :order.Id];
    System.assertEquals(
      'Processing',
      updated.Status__c,
      'Non-Shipped status changes should not be blocked.'
    );
  }
}
