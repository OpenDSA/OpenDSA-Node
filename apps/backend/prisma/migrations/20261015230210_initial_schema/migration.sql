-- CreateTable
CREATE TABLE `active_admin_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `namespace` VARCHAR(255) NULL,
    `body` TEXT NULL,
    `resource_id` VARCHAR(255) NOT NULL,
    `resource_type` VARCHAR(255) NOT NULL,
    `author_id` INTEGER NULL,
    `author_type` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `index_active_admin_comments_on_author_type_and_author_id`(`author_type`, `author_id`),
    INDEX `index_active_admin_comments_on_namespace`(`namespace`),
    INDEX `index_active_admin_comments_on_resource_type_and_resource_id`(`resource_type`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_enrollments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `course_offering_id` INTEGER NOT NULL,
    `course_role_id` INTEGER NOT NULL,

    INDEX `index_course_enrollments_on_course_offering_id`(`course_offering_id`),
    INDEX `index_course_enrollments_on_course_role_id`(`course_role_id`),
    INDEX `index_course_enrollments_on_user_id`(`user_id`),
    UNIQUE INDEX `index_course_enrollments_on_user_id_and_course_offering_id`(`user_id`, `course_offering_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_offerings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `course_id` INTEGER NOT NULL,
    `term_id` INTEGER NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `url` VARCHAR(255) NULL,
    `self_enrollment_allowed` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `cutoff_date` DATE NULL,
    `late_policy_id` INTEGER NULL,
    `lms_instance_id` INTEGER NOT NULL,
    `lms_course_code` VARCHAR(255) NULL,
    `lms_course_num` VARCHAR(255) NOT NULL,
    `archived` BOOLEAN NULL DEFAULT false,

    INDEX `index_course_offerings_on_course_id`(`course_id`),
    INDEX `course_offerings_late_policy_id_fk`(`late_policy_id`),
    INDEX `index_course_offerings_on_lms_instance_id_and_lms_course_num`(`lms_instance_id`, `lms_course_num`),
    INDEX `index_course_offerings_on_term_id`(`term_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `can_manage_course` BOOLEAN NOT NULL DEFAULT false,
    `can_manage_assignments` BOOLEAN NOT NULL DEFAULT false,
    `can_grade_submissions` BOOLEAN NOT NULL DEFAULT false,
    `can_view_other_submissions` BOOLEAN NOT NULL DEFAULT false,
    `builtin` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `courses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `number` VARCHAR(255) NOT NULL,
    `organization_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `slug` VARCHAR(255) NOT NULL,

    INDEX `index_courses_on_organization_id`(`organization_id`),
    INDEX `index_courses_on_slug`(`slug`),
    INDEX `index_courses_on_user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delayed_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `handler` TEXT NOT NULL,
    `last_error` TEXT NULL,
    `run_at` DATETIME(3) NULL,
    `locked_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `locked_by` VARCHAR(255) NULL,
    `queue` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `progress_stage` VARCHAR(255) NULL,
    `progress_current` INTEGER NULL DEFAULT 0,
    `progress_max` INTEGER NULL DEFAULT 0,

    INDEX `delayed_jobs_priority`(`priority`, `run_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `errors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usable_type` VARCHAR(255) NULL,
    `usable_id` INTEGER NULL,
    `class_name` VARCHAR(255) NULL,
    `message` TEXT NULL,
    `trace` TEXT NULL,
    `target_url` TEXT NULL,
    `referer_url` TEXT NULL,
    `params` TEXT NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `index_errors_on_class_name`(`class_name`),
    INDEX `index_errors_on_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exercise_instances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inst_exercise_id` INTEGER NOT NULL,
    `context_type` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `state` JSON NULL,

    INDEX `exercise_instances_inst_exercise_id_idx`(`inst_exercise_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `friendly_id_slugs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(255) NOT NULL,
    `sluggable_id` INTEGER NOT NULL,
    `sluggable_type` VARCHAR(50) NULL,
    `scope` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,

    INDEX `index_friendly_id_slugs_on_slug_and_sluggable_type`(`slug`, `sluggable_type`),
    INDEX `index_friendly_id_slugs_on_sluggable_id`(`sluggable_id`),
    INDEX `index_friendly_id_slugs_on_sluggable_type`(`sluggable_type`),
    UNIQUE INDEX `index_friendly_id_slugs_on_slug_and_sluggable_type_and_scope`(`slug`, `sluggable_type`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `global_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `can_manage_all_courses` BOOLEAN NOT NULL DEFAULT false,
    `can_edit_system_configuration` BOOLEAN NOT NULL DEFAULT false,
    `builtin` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `provider` VARCHAR(255) NOT NULL,
    `uid` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `index_identities_on_uid_and_provider`(`uid`, `provider`),
    INDEX `index_identities_on_user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_book_section_exercises` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inst_book_id` INTEGER NOT NULL,
    `inst_section_id` INTEGER NOT NULL,
    `inst_exercise_id` INTEGER NULL,
    `exercise_instance_id` INTEGER NULL,
    `points` DECIMAL(5, 2) NOT NULL,
    `required` BOOLEAN NULL DEFAULT false,
    `threshold` DECIMAL(5, 2) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `type` BOOLEAN NULL,
    `options` LONGTEXT NULL,
    `partial_credit` BOOLEAN NULL DEFAULT false,
    `json` TEXT NULL,

    UNIQUE INDEX `inst_book_section_exercises_exercise_instance_id_key`(`exercise_instance_id`),
    INDEX `inst_book_section_exercises_inst_book_id_fk`(`inst_book_id`),
    INDEX `inst_book_section_exercises_inst_exercise_id_fk`(`inst_exercise_id`),
    INDEX `inst_book_section_exercises_inst_section_id_fk`(`inst_section_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_books` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `course_offering_id` INTEGER NULL,
    `user_id` INTEGER NOT NULL,
    `title` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `template` BOOLEAN NULL DEFAULT false,
    `desc` VARCHAR(255) NULL,
    `last_compiled` DATETIME(3) NULL,
    `options` LONGTEXT NULL,
    `book_type` INTEGER NULL,

    INDEX `inst_books_course_offering_id_fk`(`course_offering_id`),
    INDEX `inst_books_user_id_fk`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_chapter_modules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inst_chapter_id` INTEGER NOT NULL,
    `inst_module_id` INTEGER NOT NULL,
    `module_position` INTEGER NULL,
    `lms_module_item_id` INTEGER NULL,
    `lms_section_item_id` INTEGER NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `lms_assignment_id` INTEGER NULL,
    `due_dates` DATETIME(3) NULL,

    INDEX `inst_chapter_modules_inst_chapter_id_fk`(`inst_chapter_id`),
    INDEX `inst_chapter_modules_inst_module_id_fk`(`inst_module_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_chapters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inst_book_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `short_display_name` VARCHAR(45) NULL,
    `position` INTEGER NULL,
    `lms_chapter_id` INTEGER NULL,
    `lms_assignment_group_id` INTEGER NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `inst_chapters_inst_book_id_fk`(`inst_book_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_course_offering_exercises` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `course_offering_id` INTEGER NOT NULL,
    `inst_exercise_id` INTEGER NOT NULL,
    `exercise_instance_id` INTEGER NULL,
    `resource_link_id` VARCHAR(255) NULL,
    `resource_link_title` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `threshold` DECIMAL(5, 2) NOT NULL,
    `points` DECIMAL(5, 2) NOT NULL,
    `options` LONGTEXT NULL,

    UNIQUE INDEX `inst_course_offering_exercises_exercise_instance_id_key`(`exercise_instance_id`),
    INDEX `inst_course_offering_exercises_inst_exercise_id_fk`(`inst_exercise_id`),
    UNIQUE INDEX `index_inst_course_offering_exercises_on_course_offering_res`(`course_offering_id`, `resource_link_id`, `inst_exercise_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_exercises` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NULL,
    `short_name` VARCHAR(255) NOT NULL,
    `ex_type` VARCHAR(50) NULL,
    `description` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `learning_tool` VARCHAR(255) NULL,
    `av_address` VARCHAR(512) NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `links` TEXT NULL,
    `scripts` TEXT NULL,

    UNIQUE INDEX `index_inst_exercises_on_short_name`(`short_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_module_section_exercises` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inst_module_version_id` INTEGER NOT NULL,
    `inst_module_section_id` INTEGER NOT NULL,
    `inst_exercise_id` INTEGER NOT NULL,
    `exercise_instance_id` INTEGER NULL,
    `points` DECIMAL(5, 2) NOT NULL,
    `required` BOOLEAN NULL DEFAULT false,
    `threshold` DECIMAL(5, 2) NOT NULL,
    `options` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `partial_credit` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `inst_module_section_exercises_exercise_instance_id_key`(`exercise_instance_id`),
    INDEX `fk_rails_9b61737c9f`(`inst_exercise_id`),
    INDEX `fk_rails_b320810099`(`inst_module_section_id`),
    INDEX `fk_rails_5c4fc2ff52`(`inst_module_version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_module_sections` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inst_module_version_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `show` BOOLEAN NULL DEFAULT true,
    `learning_tool` VARCHAR(255) NULL,
    `resource_type` VARCHAR(255) NULL,
    `resource_name` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fk_rails_ff11275e48`(`inst_module_version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_module_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inst_module_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `git_hash` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(4096) NOT NULL,
    `template` BOOLEAN NULL DEFAULT false,
    `course_offering_id` INTEGER NULL,
    `resource_link_id` VARCHAR(255) NULL,
    `resource_link_title` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fk_rails_7e343b3134`(`inst_module_id`),
    UNIQUE INDEX `index_inst_module_versions_on_course_resource`(`course_offering_id`, `resource_link_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_modules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `path` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `current_version_id` INTEGER NULL,

    INDEX `fk_rails_73d3622e40`(`current_version_id`),
    UNIQUE INDEX `index_inst_modules_on_path`(`path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inst_sections` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inst_module_id` INTEGER NOT NULL,
    `inst_chapter_module_id` INTEGER NOT NULL,
    `short_display_name` VARCHAR(50) NULL,
    `name` VARCHAR(255) NOT NULL,
    `position` INTEGER NULL,
    `gradable` BOOLEAN NULL DEFAULT false,
    `soft_deadline` DATETIME(3) NULL,
    `hard_deadline` DATETIME(3) NULL,
    `time_limit` INTEGER NULL,
    `show` BOOLEAN NULL DEFAULT true,
    `lms_item_id` INTEGER NULL,
    `lms_assignment_id` INTEGER NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `learning_tool` VARCHAR(255) NULL,
    `resource_type` VARCHAR(255) NULL,
    `resource_name` VARCHAR(255) NULL,
    `lms_posted` BOOLEAN NULL,
    `time_posted` DATETIME(3) NULL,

    INDEX `inst_sections_inst_chapter_module_id_fk`(`inst_chapter_module_id`),
    INDEX `inst_sections_inst_module_id_fk`(`inst_module_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `languages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `late_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `late_days` INTEGER NOT NULL,
    `late_percent` INTEGER NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `index_late_policies_on_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_tools` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `secret` VARCHAR(255) NOT NULL,
    `launch_url` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `index_learning_tools_on_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lms_accesses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `access_token` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `lms_instance_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `consumer_key` VARCHAR(255) NULL,
    `consumer_secret` VARCHAR(255) NULL,

    INDEX `lms_accesses_user_id_fk`(`user_id`),
    UNIQUE INDEX `index_lms_accesses_on_lms_instance_id_and_user_id`(`lms_instance_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lms_instances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `lms_type_id` INTEGER NULL,
    `consumer_key` VARCHAR(255) NULL,
    `consumer_secret` VARCHAR(255) NULL,
    `organization_id` INTEGER NULL,
    `client_id` VARCHAR(255) NULL,
    `private_key` TEXT NULL,
    `public_key` TEXT NULL,
    `keyset_url` VARCHAR(255) NULL,
    `oauth2_url` VARCHAR(255) NULL,
    `platform_oidc_auth_url` VARCHAR(255) NULL,
    `issuer` VARCHAR(255) NULL,

    INDEX `lms_instances_lms_type_id_fk`(`lms_type_id`),
    INDEX `lms_instances_organization_id_fk`(`organization_id`),
    UNIQUE INDEX `index_lms_instances_on_url`(`url`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lms_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `index_lms_types_on_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lti_launches` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `lms_instance_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `course_offering_id` INTEGER NOT NULL,
    `id_token` TEXT NULL,
    `decoded_jwt` LONGTEXT NULL,
    `kid` VARCHAR(255) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `index_lti_launches_on_course_offering_id`(`course_offering_id`),
    INDEX `index_lti_launches_on_expires_at`(`expires_at`),
    INDEX `fk_rails_73ea582aae`(`lms_instance_id`),
    INDEX `fk_rails_bb7142408e`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odsa_book_progresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `inst_book_id` INTEGER NOT NULL,
    `started_exercises` LONGTEXT NOT NULL,
    `proficient_exercises` LONGTEXT NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `odsa_book_progresses_inst_book_id_fk`(`inst_book_id`),
    UNIQUE INDEX `index_odsa_book_progresses_on_user_id_and_inst_book_id`(`user_id`, `inst_book_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odsa_bugs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `os_family` VARCHAR(50) NOT NULL,
    `browser_family` VARCHAR(20) NOT NULL,
    `title` VARCHAR(50) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `screenshot` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odsa_exercise_attempts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `inst_book_id` INTEGER NULL,
    `inst_section_id` INTEGER NULL,
    `exercise_instance_id` INTEGER NULL,
    `worth_credit` BOOLEAN NOT NULL,
    `time_done` DATETIME(3) NOT NULL,
    `time_taken` INTEGER NOT NULL,
    `count_hints` INTEGER NOT NULL,
    `hint_used` BOOLEAN NOT NULL,
    `points_earned` DECIMAL(5, 2) NOT NULL,
    `earned_proficiency` BOOLEAN NOT NULL,
    `count_attempts` BIGINT NOT NULL,
    `ip_address` VARCHAR(20) NOT NULL,
    `question_name` VARCHAR(50) NOT NULL,
    `request_type` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `correct` BOOLEAN NULL,
    `pe_score` DECIMAL(5, 2) NULL,
    `pe_steps_fixed` INTEGER NULL,
    `answer` VARCHAR(255) NULL,
    `question_id` INTEGER NULL,
    `finished_frame` BOOLEAN NULL,
    `state` JSON NULL,

    INDEX `odsa_exercise_attempts_inst_book_id_fk`(`inst_book_id`),
    INDEX `odsa_exercise_attempts_inst_section_id_fk`(`inst_section_id`),
    INDEX `odsa_exercise_attempts_exercise_instance_id_idx`(`exercise_instance_id`),
    INDEX `odsa_exercise_attempts_user_id_fk`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odsa_exercise_progresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `current_score` INTEGER NOT NULL,
    `highest_score` INTEGER NOT NULL,
    `first_done` DATETIME(3) NOT NULL,
    `last_done` DATETIME(3) NOT NULL,
    `total_correct` INTEGER NOT NULL,
    `total_worth_credit` INTEGER NOT NULL,
    `proficient_date` DATETIME(3) NOT NULL,
    `current_exercise` VARCHAR(255) NULL,
    `correct_exercises` VARCHAR(255) NULL,
    `hinted_exercise` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `lis_outcome_service_url` VARCHAR(255) NULL,
    `lis_result_sourcedid` VARCHAR(255) NULL,
    `lms_access_id` INTEGER NULL,
    `exercise_instance_id` INTEGER NULL,

    INDEX `fk_rails_3327f6b532`(`lms_access_id`),
    UNIQUE INDEX `odsa_exercise_progresses_user_id_exercise_instance_id_key`(`user_id`, `exercise_instance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odsa_module_progresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `inst_book_id` INTEGER NULL,
    `first_done` DATETIME(3) NOT NULL,
    `last_done` DATETIME(3) NOT NULL,
    `proficient_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `inst_chapter_module_id` INTEGER NULL,
    `lis_outcome_service_url` VARCHAR(255) NULL,
    `lis_result_sourcedid` VARCHAR(255) NULL,
    `current_score` DOUBLE NOT NULL,
    `highest_score` DOUBLE NOT NULL,
    `lms_access_id` INTEGER NULL,
    `inst_module_version_id` INTEGER NULL,
    `last_passback` DATETIME(3) NOT NULL,

    INDEX `odsa_module_progresses_inst_book_id_fk`(`inst_book_id`),
    INDEX `odsa_module_progresses_inst_chapter_module_id_fk`(`inst_chapter_module_id`),
    INDEX `fk_rails_38a9ac7560`(`inst_module_version_id`),
    INDEX `odsa_module_progresses_lms_access_id_fk`(`lms_access_id`),
    UNIQUE INDEX `index_odsa_module_progress_on_user_and_module`(`user_id`, `inst_chapter_module_id`),
    UNIQUE INDEX `index_odsa_mod_prog_on_user_mod_version`(`user_id`, `inst_module_version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odsa_student_extensions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `inst_section_id` INTEGER NOT NULL,
    `soft_deadline` DATETIME(3) NULL,
    `hard_deadline` DATETIME(3) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `time_limit` INTEGER NULL,
    `opening_date` DATETIME(3) NULL,

    INDEX `odsa_student_extensions_inst_section_id_fk`(`inst_section_id`),
    INDEX `odsa_student_extensions_user_id_fk`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odsa_user_interactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `inst_book_id` INTEGER NULL,
    `inst_section_id` INTEGER NULL,
    `exercise_instance_id` INTEGER NULL,
    `name` VARCHAR(50) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `action_time` DATETIME(3) NOT NULL,
    `uiid` BIGINT NOT NULL,
    `browser_family` VARCHAR(20) NOT NULL,
    `browser_version` VARCHAR(20) NOT NULL,
    `os_family` VARCHAR(50) NOT NULL,
    `os_version` VARCHAR(20) NOT NULL,
    `device` VARCHAR(50) NOT NULL,
    `ip_address` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `inst_chapter_module_id` INTEGER NULL,
    `inst_module_version_id` INTEGER NULL,

    INDEX `odsa_user_interactions_inst_book_id_fk`(`inst_book_id`),
    INDEX `index_odsa_user_interactions_on_inst_chapter_module`(`inst_chapter_module_id`),
    INDEX `fk_rails_599b647d17`(`inst_module_version_id`),
    INDEX `odsa_user_interactions_inst_section_id_fk`(`inst_section_id`),
    INDEX `odsa_user_interactions_user_id_fk`(`user_id`),
    INDEX `odsa_user_interactions_exercise_instance_id_idx`(`exercise_instance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `odsa_user_time_trackings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `inst_book_id` INTEGER NULL,
    `inst_section_id` INTEGER NULL,
    `inst_module_id` INTEGER NULL,
    `inst_chapter_id` INTEGER NULL,
    `inst_module_version_id` INTEGER NULL,
    `exercise_instance_id` INTEGER NULL,
    `uuid` VARCHAR(50) NOT NULL,
    `session_date` VARCHAR(50) NOT NULL,
    `total_time` DECIMAL(10, 2) NOT NULL,
    `sections_time` TEXT NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `index_odsa_user_time_trackings_on_inst_book_id_session_date`(`inst_book_id`, `session_date`),
    INDEX `odsa_user_time_tracking_inst_chapter_id_fk`(`inst_chapter_id`),
    INDEX `odsa_user_time_tracking_inst_module_id_fk`(`inst_module_id`),
    INDEX `odsa_user_time_tracking_inst_module_version_id_fk`(`inst_module_version_id`),
    INDEX `odsa_user_time_tracking_inst_section_id_fk`(`inst_section_id`),
    INDEX `odsa_user_time_trackings_exercise_instance_id_idx`(`exercise_instance_id`),
    UNIQUE INDEX `index_odsa_user_time_trackings_on_user_id_uuid`(`user_id`, `uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `abbreviation` VARCHAR(255) NULL,
    `slug` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `index_organizations_on_name`(`name`),
    UNIQUE INDEX `index_organizations_on_slug`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_exercise_progresses` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `exercise_id` INTEGER NOT NULL,
    `progress` TEXT NULL,
    `grade` DECIMAL(5, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `season` INTEGER NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NOT NULL,
    `year` INTEGER NOT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `slug` VARCHAR(255) NOT NULL,

    INDEX `index_terms_on_starts_on`(`starts_on`),
    INDEX `index_terms_on_year_and_season`(`year`, `season`),
    UNIQUE INDEX `index_terms_on_slug`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `time_zones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NULL,
    `zone` VARCHAR(255) NULL,
    `display_as` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL DEFAULT '',
    `encrypted_password` VARCHAR(255) NOT NULL DEFAULT '',
    `reset_password_token` VARCHAR(255) NULL,
    `reset_password_sent_at` DATETIME(3) NULL,
    `remember_created_at` DATETIME(3) NULL,
    `sign_in_count` INTEGER NOT NULL DEFAULT 0,
    `current_sign_in_at` DATETIME(3) NULL,
    `last_sign_in_at` DATETIME(3) NULL,
    `current_sign_in_ip` VARCHAR(255) NULL,
    `last_sign_in_ip` VARCHAR(255) NULL,
    `confirmation_token` VARCHAR(255) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `confirmation_sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `first_name` VARCHAR(255) NULL,
    `last_name` VARCHAR(255) NULL,
    `global_role_id` INTEGER NOT NULL,
    `avatar` VARCHAR(255) NULL,
    `slug` VARCHAR(255) NOT NULL,
    `time_zone_id` INTEGER NULL,

    INDEX `index_users_on_global_role_id`(`global_role_id`),
    INDEX `index_users_on_time_zone_id`(`time_zone_id`),
    UNIQUE INDEX `index_users_on_confirmation_token`(`confirmation_token`),
    UNIQUE INDEX `index_users_on_email`(`email`),
    UNIQUE INDEX `index_users_on_reset_password_token`(`reset_password_token`),
    UNIQUE INDEX `index_users_on_slug`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `course_enrollments` ADD CONSTRAINT `course_enrollments_course_offering_id_fkey` FOREIGN KEY (`course_offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_enrollments` ADD CONSTRAINT `course_enrollments_course_role_id_fkey` FOREIGN KEY (`course_role_id`) REFERENCES `course_roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_enrollments` ADD CONSTRAINT `course_enrollments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_offerings` ADD CONSTRAINT `course_offerings_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_offerings` ADD CONSTRAINT `course_offerings_late_policy_id_fkey` FOREIGN KEY (`late_policy_id`) REFERENCES `late_policies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_offerings` ADD CONSTRAINT `course_offerings_lms_instance_id_fkey` FOREIGN KEY (`lms_instance_id`) REFERENCES `lms_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_offerings` ADD CONSTRAINT `course_offerings_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_instances` ADD CONSTRAINT `exercise_instances_inst_exercise_id_fkey` FOREIGN KEY (`inst_exercise_id`) REFERENCES `inst_exercises`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identities` ADD CONSTRAINT `identities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_book_section_exercises` ADD CONSTRAINT `inst_book_section_exercises_inst_book_id_fkey` FOREIGN KEY (`inst_book_id`) REFERENCES `inst_books`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_book_section_exercises` ADD CONSTRAINT `inst_book_section_exercises_inst_exercise_id_fkey` FOREIGN KEY (`inst_exercise_id`) REFERENCES `inst_exercises`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_book_section_exercises` ADD CONSTRAINT `inst_book_section_exercises_inst_section_id_fkey` FOREIGN KEY (`inst_section_id`) REFERENCES `inst_sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_book_section_exercises` ADD CONSTRAINT `inst_book_section_exercises_exercise_instance_id_fkey` FOREIGN KEY (`exercise_instance_id`) REFERENCES `exercise_instances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_books` ADD CONSTRAINT `inst_books_course_offering_id_fkey` FOREIGN KEY (`course_offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_books` ADD CONSTRAINT `inst_books_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_chapter_modules` ADD CONSTRAINT `inst_chapter_modules_inst_chapter_id_fkey` FOREIGN KEY (`inst_chapter_id`) REFERENCES `inst_chapters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_chapter_modules` ADD CONSTRAINT `inst_chapter_modules_inst_module_id_fkey` FOREIGN KEY (`inst_module_id`) REFERENCES `inst_modules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_chapters` ADD CONSTRAINT `inst_chapters_inst_book_id_fkey` FOREIGN KEY (`inst_book_id`) REFERENCES `inst_books`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_course_offering_exercises` ADD CONSTRAINT `inst_course_offering_exercises_course_offering_id_fkey` FOREIGN KEY (`course_offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_course_offering_exercises` ADD CONSTRAINT `inst_course_offering_exercises_inst_exercise_id_fkey` FOREIGN KEY (`inst_exercise_id`) REFERENCES `inst_exercises`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_course_offering_exercises` ADD CONSTRAINT `inst_course_offering_exercises_exercise_instance_id_fkey` FOREIGN KEY (`exercise_instance_id`) REFERENCES `exercise_instances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_module_section_exercises` ADD CONSTRAINT `inst_module_section_exercises_inst_exercise_id_fkey` FOREIGN KEY (`inst_exercise_id`) REFERENCES `inst_exercises`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_module_section_exercises` ADD CONSTRAINT `inst_module_section_exercises_inst_module_section_id_fkey` FOREIGN KEY (`inst_module_section_id`) REFERENCES `inst_module_sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_module_section_exercises` ADD CONSTRAINT `inst_module_section_exercises_inst_module_version_id_fkey` FOREIGN KEY (`inst_module_version_id`) REFERENCES `inst_module_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_module_section_exercises` ADD CONSTRAINT `inst_module_section_exercises_exercise_instance_id_fkey` FOREIGN KEY (`exercise_instance_id`) REFERENCES `exercise_instances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_module_sections` ADD CONSTRAINT `inst_module_sections_inst_module_version_id_fkey` FOREIGN KEY (`inst_module_version_id`) REFERENCES `inst_module_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_module_versions` ADD CONSTRAINT `inst_module_versions_course_offering_id_fkey` FOREIGN KEY (`course_offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_module_versions` ADD CONSTRAINT `inst_module_versions_inst_module_id_fkey` FOREIGN KEY (`inst_module_id`) REFERENCES `inst_modules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_modules` ADD CONSTRAINT `inst_modules_current_version_id_fkey` FOREIGN KEY (`current_version_id`) REFERENCES `inst_module_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_sections` ADD CONSTRAINT `inst_sections_inst_chapter_module_id_fkey` FOREIGN KEY (`inst_chapter_module_id`) REFERENCES `inst_chapter_modules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inst_sections` ADD CONSTRAINT `inst_sections_inst_module_id_fkey` FOREIGN KEY (`inst_module_id`) REFERENCES `inst_modules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lms_accesses` ADD CONSTRAINT `lms_accesses_lms_instance_id_fkey` FOREIGN KEY (`lms_instance_id`) REFERENCES `lms_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lms_accesses` ADD CONSTRAINT `lms_accesses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lms_instances` ADD CONSTRAINT `lms_instances_lms_type_id_fkey` FOREIGN KEY (`lms_type_id`) REFERENCES `lms_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lms_instances` ADD CONSTRAINT `lms_instances_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lti_launches` ADD CONSTRAINT `lti_launches_course_offering_id_fkey` FOREIGN KEY (`course_offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lti_launches` ADD CONSTRAINT `lti_launches_lms_instance_id_fkey` FOREIGN KEY (`lms_instance_id`) REFERENCES `lms_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lti_launches` ADD CONSTRAINT `lti_launches_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_book_progresses` ADD CONSTRAINT `odsa_book_progresses_inst_book_id_fkey` FOREIGN KEY (`inst_book_id`) REFERENCES `inst_books`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_book_progresses` ADD CONSTRAINT `odsa_book_progresses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_exercise_attempts` ADD CONSTRAINT `odsa_exercise_attempts_inst_book_id_fkey` FOREIGN KEY (`inst_book_id`) REFERENCES `inst_books`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_exercise_attempts` ADD CONSTRAINT `odsa_exercise_attempts_inst_section_id_fkey` FOREIGN KEY (`inst_section_id`) REFERENCES `inst_sections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_exercise_attempts` ADD CONSTRAINT `odsa_exercise_attempts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_exercise_attempts` ADD CONSTRAINT `odsa_exercise_attempts_exercise_instance_id_fkey` FOREIGN KEY (`exercise_instance_id`) REFERENCES `exercise_instances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_exercise_progresses` ADD CONSTRAINT `odsa_exercise_progresses_lms_access_id_fkey` FOREIGN KEY (`lms_access_id`) REFERENCES `lms_accesses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_exercise_progresses` ADD CONSTRAINT `odsa_exercise_progresses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_exercise_progresses` ADD CONSTRAINT `odsa_exercise_progresses_exercise_instance_id_fkey` FOREIGN KEY (`exercise_instance_id`) REFERENCES `exercise_instances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_module_progresses` ADD CONSTRAINT `odsa_module_progresses_inst_book_id_fkey` FOREIGN KEY (`inst_book_id`) REFERENCES `inst_books`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_module_progresses` ADD CONSTRAINT `odsa_module_progresses_inst_chapter_module_id_fkey` FOREIGN KEY (`inst_chapter_module_id`) REFERENCES `inst_chapter_modules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_module_progresses` ADD CONSTRAINT `odsa_module_progresses_inst_module_version_id_fkey` FOREIGN KEY (`inst_module_version_id`) REFERENCES `inst_module_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_module_progresses` ADD CONSTRAINT `odsa_module_progresses_lms_access_id_fkey` FOREIGN KEY (`lms_access_id`) REFERENCES `lms_accesses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_module_progresses` ADD CONSTRAINT `odsa_module_progresses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_student_extensions` ADD CONSTRAINT `odsa_student_extensions_inst_section_id_fkey` FOREIGN KEY (`inst_section_id`) REFERENCES `inst_sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_student_extensions` ADD CONSTRAINT `odsa_student_extensions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_interactions` ADD CONSTRAINT `odsa_user_interactions_inst_book_id_fkey` FOREIGN KEY (`inst_book_id`) REFERENCES `inst_books`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_interactions` ADD CONSTRAINT `odsa_user_interactions_inst_module_version_id_fkey` FOREIGN KEY (`inst_module_version_id`) REFERENCES `inst_module_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_interactions` ADD CONSTRAINT `odsa_user_interactions_inst_section_id_fkey` FOREIGN KEY (`inst_section_id`) REFERENCES `inst_sections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_interactions` ADD CONSTRAINT `odsa_user_interactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_interactions` ADD CONSTRAINT `odsa_user_interactions_exercise_instance_id_fkey` FOREIGN KEY (`exercise_instance_id`) REFERENCES `exercise_instances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_time_trackings` ADD CONSTRAINT `odsa_user_time_trackings_inst_book_id_fkey` FOREIGN KEY (`inst_book_id`) REFERENCES `inst_books`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_time_trackings` ADD CONSTRAINT `odsa_user_time_trackings_inst_chapter_id_fkey` FOREIGN KEY (`inst_chapter_id`) REFERENCES `inst_chapters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_time_trackings` ADD CONSTRAINT `odsa_user_time_trackings_inst_module_version_id_fkey` FOREIGN KEY (`inst_module_version_id`) REFERENCES `inst_module_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_time_trackings` ADD CONSTRAINT `odsa_user_time_trackings_inst_module_id_fkey` FOREIGN KEY (`inst_module_id`) REFERENCES `inst_modules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_time_trackings` ADD CONSTRAINT `odsa_user_time_trackings_inst_section_id_fkey` FOREIGN KEY (`inst_section_id`) REFERENCES `inst_sections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_time_trackings` ADD CONSTRAINT `odsa_user_time_trackings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odsa_user_time_trackings` ADD CONSTRAINT `odsa_user_time_trackings_exercise_instance_id_fkey` FOREIGN KEY (`exercise_instance_id`) REFERENCES `exercise_instances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_global_role_id_fkey` FOREIGN KEY (`global_role_id`) REFERENCES `global_roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_time_zone_id_fkey` FOREIGN KEY (`time_zone_id`) REFERENCES `time_zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
