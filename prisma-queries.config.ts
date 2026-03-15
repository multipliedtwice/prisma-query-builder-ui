import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/queries-schema.prisma",
  migrations: {
    path: "prisma/queries-migrations",
  },
  datasource: {
    url: "file:./queries.db",
  },
});