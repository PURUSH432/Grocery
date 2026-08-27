USE goquick;

SET @add_rzp_order = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE orders ADD COLUMN razorpay_order_id VARCHAR(80) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'razorpay_order_id');
PREPARE add_rzp_order_statement FROM @add_rzp_order;
EXECUTE add_rzp_order_statement;
DEALLOCATE PREPARE add_rzp_order_statement;

SET @add_rzp_payment = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE orders ADD COLUMN razorpay_payment_id VARCHAR(80) NULL', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'razorpay_payment_id');
PREPARE add_rzp_payment_statement FROM @add_rzp_payment;
EXECUTE add_rzp_payment_statement;
DEALLOCATE PREPARE add_rzp_payment_statement;