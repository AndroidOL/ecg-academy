<?php
declare(strict_types=1);

namespace App;

final class Schema
{
    public static function up(\PDO $pdo): void
    {
        $statements = [
            "CREATE TABLE IF NOT EXISTS users (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                public_id CHAR(20) NOT NULL,
                username VARCHAR(32) NULL,
                password_hash VARCHAR(255) NULL,
                display_name VARCHAR(32) NOT NULL,
                is_guest TINYINT(1) NOT NULL DEFAULT 1,
                is_admin TINYINT(1) NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                ai_daily_limit INT NULL,
                level_override TINYINT NULL,
                email VARCHAR(190) NULL,
                email_verified_at DATETIME NULL,
                ai_credits INT NOT NULL DEFAULT 0,
                ai_violations INT NOT NULL DEFAULT 0,
                ai_disabled_until DATETIME NULL,
                ai_last_request_at DATETIME NULL,
                xp INT NOT NULL DEFAULT 0,
                theme VARCHAR(8) NOT NULL DEFAULT 'auto',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_users_public_id (public_id),
                UNIQUE KEY uk_users_username (username),
                UNIQUE KEY uk_users_email (email),
                KEY idx_users_guest (is_guest),
                KEY idx_users_xp (xp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS user_progress (
                user_id BIGINT UNSIGNED NOT NULL,
                diagnosis_id VARCHAR(64) NOT NULL,
                status ENUM('read','mastered') NOT NULL DEFAULT 'read',
                read_at DATETIME NULL,
                mastered_at DATETIME NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, diagnosis_id),
                KEY idx_progress_diagnosis (diagnosis_id),
                CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS quiz_attempts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                case_key VARCHAR(80) NOT NULL,
                payload JSON NOT NULL,
                correct_ids JSON NOT NULL,
                option_ids JSON NOT NULL,
                selected_ids JSON NULL,
                is_correct TINYINT(1) NULL,
                score INT NOT NULL DEFAULT 0,
                time_ms INT NULL,
                status ENUM('pending','answered','expired') NOT NULL DEFAULT 'pending',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                answered_at DATETIME NULL,
                KEY idx_quiz_user_time (user_id, created_at),
                KEY idx_quiz_status (status),
                CONSTRAINT fk_quiz_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS sim_sessions (
                id CHAR(24) NOT NULL PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                scenario_id VARCHAR(48) NOT NULL,
                state JSON NOT NULL,
                status ENUM('active','ended') NOT NULL DEFAULT 'active',
                started_at DATETIME(3) NOT NULL,
                updated_at DATETIME(3) NOT NULL,
                KEY idx_sim_user (user_id),
                KEY idx_sim_status (status),
                CONSTRAINT fk_sim_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS sim_runs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                scenario_id VARCHAR(48) NOT NULL,
                score INT NOT NULL DEFAULT 0,
                grade VARCHAR(8) NOT NULL DEFAULT 'C',
                outcome VARCHAR(24) NOT NULL DEFAULT 'failed',
                actions JSON NOT NULL,
                duration_s INT NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_sim_runs_user (user_id, created_at),
                KEY idx_sim_runs_scenario (scenario_id),
                CONSTRAINT fk_sim_run_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS auth_throttle (
                throttle_key VARCHAR(120) NOT NULL PRIMARY KEY,
                window_start INT UNSIGNED NOT NULL,
                fail_count INT UNSIGNED NOT NULL DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS consumed_tokens (
                token_hash CHAR(64) NOT NULL PRIMARY KEY,
                expires_at DATETIME NOT NULL,
                KEY idx_consumed_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS ai_usage (
                user_id BIGINT UNSIGNED NOT NULL,
                usage_day DATE NOT NULL,
                used_count INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, usage_day),
                CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS ai_usage_log (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NULL,
                provider VARCHAR(80) NOT NULL DEFAULT '',
                model VARCHAR(100) NOT NULL DEFAULT '',
                mode VARCHAR(20) NOT NULL DEFAULT '',
                prompt_tokens INT UNSIGNED NOT NULL DEFAULT 0,
                completion_tokens INT UNSIGNED NOT NULL DEFAULT 0,
                total_tokens INT UNSIGNED NOT NULL DEFAULT 0,
                cost_micro BIGINT NOT NULL DEFAULT 0,
                discount_label VARCHAR(40) NULL,
                discount_ratio DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
                source VARCHAR(8) NOT NULL DEFAULT 'ai',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_ai_log_time (created_at),
                KEY idx_ai_log_model (model)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS user_study (
                user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
                reviews JSON NOT NULL,
                favorites JSON NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_study_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS app_settings (
                setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
                setting_value LONGTEXT NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS admin_passkeys (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                credential_id VARCHAR(512) NOT NULL,
                public_key TEXT NOT NULL,
                sign_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
                label VARCHAR(80) NOT NULL DEFAULT 'Passkey',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_used_at DATETIME NULL,
                UNIQUE KEY uk_passkey_credential (credential_id(191)),
                KEY idx_passkey_user (user_id),
                CONSTRAINT fk_passkey_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS learning_events (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                chapter VARCHAR(64) NOT NULL,
                question_id VARCHAR(64) NOT NULL,
                mode VARCHAR(16) NOT NULL,
                round_id VARCHAR(64) NOT NULL DEFAULT '',
                correct TINYINT(1) NOT NULL DEFAULT 0,
                time_ms INT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_learning_user_chapter (user_id, chapter, id),
                KEY idx_learning_round (user_id, round_id),
                CONSTRAINT fk_learning_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS learning_status (
                user_id BIGINT UNSIGNED NOT NULL,
                chapter VARCHAR(64) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'learning',
                last_round VARCHAR(64) NOT NULL DEFAULT '',
                learned_at DATETIME NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, chapter),
                CONSTRAINT fk_learning_status_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS practice_daily_scores (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                day DATE NOT NULL,
                score INT NOT NULL DEFAULT 0,
                correct INT NOT NULL DEFAULT 0,
                wrong INT NOT NULL DEFAULT 0,
                locked_until DATETIME NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_practice_user_day (user_id, day),
                KEY idx_practice_day_score (day, score),
                CONSTRAINT fk_practice_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS daily_results (                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                day DATE NOT NULL,
                correct INT NOT NULL DEFAULT 0,
                total INT NOT NULL DEFAULT 0,
                score INT NOT NULL DEFAULT 0,
                xp INT NOT NULL DEFAULT 0,
                time_ms INT NOT NULL DEFAULT 0,
                details JSON NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_daily_user_day (user_id, day),
                KEY idx_daily_day (day),
                CONSTRAINT fk_daily_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS visitor_events (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                day DATE NOT NULL,
                path VARCHAR(160) NOT NULL,
                ip VARCHAR(64) NOT NULL,
                ip_hash CHAR(64) NOT NULL,
                ua VARCHAR(255) NOT NULL DEFAULT '',
                referer VARCHAR(255) NOT NULL DEFAULT '',
                user_id BIGINT UNSIGNED NULL,
                is_guest TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_visit_day (day),
                KEY idx_visit_ip_day (ip_hash, day),
                KEY idx_visit_path_day (path, day)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS assignments (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(16) NOT NULL,
                title VARCHAR(120) NOT NULL,
                class_name VARCHAR(80) NOT NULL DEFAULT '',
                level TINYINT NOT NULL DEFAULT 1,
                chapter VARCHAR(64) NOT NULL DEFAULT 'all',
                focus TEXT NULL,
                active TINYINT(1) NOT NULL DEFAULT 1,
                created_by BIGINT UNSIGNED NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_assignment_code (code),
                KEY idx_assignment_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS assignment_attempts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                assignment_id BIGINT UNSIGNED NOT NULL,
                device_hash CHAR(64) NOT NULL,
                correct TINYINT(1) NOT NULL DEFAULT 0,
                score INT NOT NULL DEFAULT 0,
                time_ms INT NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_attempt_assignment (assignment_id),
                KEY idx_attempt_device (device_hash),
                CONSTRAINT fk_attempt_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS course_packs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                pack_id VARCHAR(64) NOT NULL,
                version VARCHAR(32) NOT NULL,
                name VARCHAR(120) NOT NULL,
                license VARCHAR(80) NOT NULL,
                review_status VARCHAR(24) NOT NULL DEFAULT 'editorial',
                status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
                payload JSON NOT NULL,
                sha256 CHAR(64) NOT NULL,
                chapter_count INT NOT NULL DEFAULT 0,
                article_count INT NOT NULL DEFAULT 0,
                imported_by BIGINT UNSIGNED NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_pack_version (pack_id, version),
                KEY idx_pack_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS ai_conversations (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NULL,
                ip_hash CHAR(64) NOT NULL DEFAULT '',
                mode VARCHAR(24) NOT NULL DEFAULT 'chat',
                question MEDIUMTEXT NOT NULL,
                answer MEDIUMTEXT NOT NULL,
                source VARCHAR(8) NOT NULL DEFAULT 'ai',
                account_charge TINYINT(1) NOT NULL DEFAULT 0,
                prompt_tokens INT UNSIGNED NOT NULL DEFAULT 0,
                completion_tokens INT UNSIGNED NOT NULL DEFAULT 0,
                cost_micro BIGINT NOT NULL DEFAULT 0,
                flags JSON NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_conv_user_time (user_id, created_at),
                KEY idx_conv_time (created_at),
                KEY idx_conv_mode (mode)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS ai_violation_log (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NULL,
                ip_hash CHAR(64) NOT NULL DEFAULT '',
                reason VARCHAR(80) NOT NULL DEFAULT '',
                snippet VARCHAR(320) NOT NULL DEFAULT '',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_violation_user_time (user_id, created_at),
                KEY idx_violation_time (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS ai_credit_log (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                delta INT NOT NULL,
                balance INT NOT NULL,
                reason VARCHAR(80) NOT NULL DEFAULT '',
                ref_day DATE NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_credit_user_time (user_id, created_at),
                CONSTRAINT fk_credit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS ai_ip_usage (
                ip_hash CHAR(64) NOT NULL,
                usage_day DATE NOT NULL,
                used_count INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (ip_hash, usage_day)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS ai_analysis_usage (
                user_id BIGINT UNSIGNED NOT NULL,
                usage_day DATE NOT NULL,
                used_count INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, usage_day),
                CONSTRAINT fk_analysis_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS email_verification_codes (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(190) NOT NULL,
                purpose VARCHAR(24) NOT NULL DEFAULT 'register',
                code_hash CHAR(64) NOT NULL,
                ip_hash CHAR(64) NOT NULL DEFAULT '',
                attempts INT UNSIGNED NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                used_at DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_email_code_email (email, created_at),
                KEY idx_email_code_ip (ip_hash, created_at),
                KEY idx_email_code_expiry (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS admin_audit (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NULL,
                action VARCHAR(80) NOT NULL,
                detail JSON NULL,
                ip VARCHAR(64) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_audit_time (created_at),
                KEY idx_audit_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ];

        foreach ($statements as $sql) {
            $pdo->exec($sql);
        }

        self::ensureColumn($pdo, 'users', 'is_admin', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER is_guest');
        self::ensureColumn($pdo, 'users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER is_admin');
        self::ensureColumn($pdo, 'users', 'ai_daily_limit', 'INT NULL AFTER is_active');
        self::ensureColumn($pdo, 'learning_events', 'time_ms', 'INT NULL AFTER correct');
        self::ensureColumn($pdo, 'users', 'level_override', 'TINYINT NULL AFTER ai_daily_limit');
        self::ensureColumn($pdo, 'users', 'email', 'VARCHAR(190) NULL AFTER level_override');
        self::ensureColumn($pdo, 'users', 'email_verified_at', 'DATETIME NULL AFTER email');
        self::ensureColumn($pdo, 'users', 'ai_credits', 'INT NOT NULL DEFAULT 0 AFTER email_verified_at');
        self::ensureColumn($pdo, 'users', 'ai_violations', 'INT NOT NULL DEFAULT 0 AFTER ai_credits');
        self::ensureColumn($pdo, 'users', 'ai_disabled_until', 'DATETIME NULL AFTER ai_violations');
        self::ensureColumn($pdo, 'users', 'ai_last_request_at', 'DATETIME NULL AFTER ai_disabled_until');
        self::ensureUniqueIndex($pdo, 'users', 'uk_users_email', 'email');

        $defaults = [
            'auth.registration_enabled' => true,
            'auth.user_login_enabled' => true,
            'auth.registration_daily_limit' => 5,
            'auth.email_code_ttl' => 600,
            'auth.email_daily_per_address' => 3,
            'auth.email_daily_per_ip' => 5,
            'smtp.enabled' => false,
            'smtp.host' => '',
            'smtp.port' => 587,
            'smtp.secure' => 'tls',
            'smtp.username' => '',
            'smtp.password_enc' => '',
            'smtp.from_email' => '',
            'smtp.from_name' => '心迹 ECG Lab',
            'admin.password_login_enabled' => true,
            'admin.passkey_login_enabled' => true,
            'ai.enabled' => false,
            'ai.daily_limit' => 30,
            'ai.level_required' => 10,
            'ai.credit_base' => 10,
            'ai.credit_cap' => 100,
            'ai.analysis_daily_limit' => 5,
            'ai.min_interval_seconds' => 5,
            'ai.ip_daily_limit' => 60,
            'ai.violation_limit' => 5,
            'ai.violation_window_hours' => 24,
            'ai.disabled_hours' => 24,
            'ai.default_provider' => '',
            'ai.system_prompt_append' => '',
            'ai.byok_enabled' => false,
            'ai.max_tokens' => 1200,
            'ai.pricing' => [],
            'ai.discounts' => [],
            'ai.currency' => '¥',
        ];
        $stmt = $pdo->prepare('INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)');
        foreach ($defaults as $key => $value) {
            $stmt->execute([$key, json_encode($value, JSON_UNESCAPED_UNICODE)]);
        }
    }

    private static function ensureUniqueIndex(\PDO $pdo, string $table, string $index, string $column): void
    {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
        $stmt->execute([$table, $index]);
        if ((int) $stmt->fetchColumn() === 0) {
            try {
                $pdo->exec("ALTER TABLE `{$table}` ADD UNIQUE KEY `{$index}` (`{$column}`)");
            } catch (\Throwable $e) {
                error_log('[schema] unique index skipped: ' . $e->getMessage());
            }
        }
    }

    private static function ensureColumn(\PDO $pdo, string $table, string $column, string $definition): void
    {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $stmt->execute([$table, $column]);
        if ((int) $stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        }
    }
}
