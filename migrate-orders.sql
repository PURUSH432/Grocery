USE goquick;

SET @add_customer_name = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE orders ADD COLUMN customer_name VARCHAR(120) NOT NULL DEFAULT ""', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'customer_name');
PREPARE add_customer_name_statement FROM @add_customer_name;
EXECUTE add_customer_name_statement;
DEALLOCATE PREPARE add_customer_name_statement;

SET @add_phone = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE orders ADD COLUMN phone VARCHAR(30) NOT NULL DEFAULT ""', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'phone');
PREPARE add_phone_statement FROM @add_phone;
EXECUTE add_phone_statement;
DEALLOCATE PREPARE add_phone_statement;

SET @add_payment = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE orders ADD COLUMN payment_method ENUM("UPI", "Debit Card", "Cash on Delivery") NOT NULL DEFAULT "Cash on Delivery"', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_method');
PREPARE add_payment_statement FROM @add_payment;
EXECUTE add_payment_statement;
DEALLOCATE PREPARE add_payment_statement;
