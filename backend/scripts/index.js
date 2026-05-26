import { connectDB } from "../src/config/db.js";

console.log("Iniciando app...");

async function main() {
  try {
    console.log("Conectando...");
    const connection = await connectDB();
    const [rows] = await connection.query("SELECT * FROM `ordenes_compra`.`usuarios`");
    console.log("Resultado:", rows);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();