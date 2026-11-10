-- CreateTable
CREATE TABLE `lti_id_tokens` (
    `id` VARCHAR(36) NOT NULL,
    `lms_instance_id` INTEGER NULL,
    `claims` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lti_id_tokens_lms_instance_id_idx`(`lms_instance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lti_access_tokens` (
    `cache_key` VARCHAR(64) NOT NULL,
    `token` JSON NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lti_access_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`cache_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lti_nonces` (
    `nonce` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lti_nonces_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`nonce`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
