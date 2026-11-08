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
                xp INT NOT NULL DEFAULT 0,
                theme VARCHAR(8) NOT NULL DEFAULT 'auto',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_users_public_id (public_id),
                UNIQUE KEY uk_users_username (username),
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

            "CREATE TABLE IF NOT EXISTS ai_usage (
                user_id BIGINT UNSIGNED NOT NULL,
                usage_day DATE NOT NULL,
                used_count INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, usage_day),
                CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ];

        foreach ($statements as $sql) {
            $pdo->exec($sql);
        }
    }
}
