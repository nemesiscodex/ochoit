import alchemy from "alchemy";
import { TanStackStart } from "alchemy/cloudflare";
import { config } from "dotenv";
// const stage = process.env.STAGE || "dev";
const app = await alchemy("ochoit");

if (app.stage === "prod") {
  config({ path: "./.env.prod" });
  config({ path: "../../apps/web/.env.prod" });
} else {
  config({ path: "./.env" });
  config({ path: "../../apps/web/.env" });
}

export const web = await TanStackStart("web", {
  cwd: "../../apps/web",
  bindings: {
    VITE_SERVER_URL: alchemy.env.VITE_SERVER_URL!,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
  },
});

console.log(`Web    -> ${web.url}`);

await app.finalize();
