const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "localhost", // BUKAN http://localhost:666
  port: 3306, // Default MySQL port (sesuai XAMPP)
  user: "root", // Atau user lain, misalnya 'seci'
  password: "", // Kosong kalau belum diubah
  database: "fire_alarm", // Nama database yang kamu buat
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
