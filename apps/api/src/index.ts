import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "../../.env") });

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`PayScope API listening on ${config.port}`);
});
