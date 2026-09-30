const db = require("./db");

async function testDatabase() {

    try {

        const [rows] = await db.query(
            "SELECT 1 AS connected"
        );

        console.log("✅ MariaDB подключена!");
        console.log(rows);

        process.exit(0);

    } catch (error) {

        console.error("❌ Ошибка подключения к БД:");
        console.error(error.message);

        process.exit(1);
    }
}

testDatabase();