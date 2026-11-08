<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

$pdo = \App\Db::pdo();
\App\Schema::up($pdo);

echo "Database schema ready: ", \App\Config::get('db.database'), PHP_EOL;
foreach ($pdo->query('SHOW TABLES')->fetchAll(\PDO::FETCH_COLUMN) as $table) {
    echo " - {$table}", PHP_EOL;
}
