import { env } from "$env/dynamic/private";
import type { EmbeddedConfig } from "../lib/types.ts";

export const load = () => {
  const isEmbedded = env.PRISMA_QUERY_BUILDER_MODE === "embedded";

  const embeddedConfig: EmbeddedConfig = {
    isEmbedded,
    disablePersistence: isEmbedded || env.DISABLE_PERSISTENCE === "true",
  };

  return { embeddedConfig };
};
