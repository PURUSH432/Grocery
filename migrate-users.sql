USE goquick;

SET @add_active = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active');
PREPARE add_active_statement FROM @add_active;
EXECUTE add_active_statement;
DEALLOCATE PREPARE add_active_statement;

SET @add_updated = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'updated_at');
PREPARE add_updated_statement FROM @add_updated;
EXECUTE add_updated_statement;
DEALLOCATE PREPARE add_updated_statement;

UPDATE users SET is_active = TRUE WHERE is_active IS NULL;