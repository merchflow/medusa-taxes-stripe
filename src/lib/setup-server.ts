// import { spawn } from 'child_process';
import { MedusaContainer } from "medusa-core-utils";
import * as path from "path";
const { spawn } = require("child_process");

type Response = {
  medusaProcess: any;
  container: MedusaContainer;
  port: number;
}

export default ({ cwd, uploadDir, verbose, env }: any): Promise<Response> => {
  const serverPath = path.join(
    __dirname,
    "..",
    "..",
    "dist",
    "lib",
    "test-server.js"
  );
  const redisUrl = process.env.REDIS_URL;

  // in order to prevent conflicts in redis, use a different db for each worker
  // same fix as for databases (works with up to 15)
  // redis dbs are 0-indexed and jest worker ids are indexed from 1
  const workerId = parseInt(process.env.JEST_WORKER_ID || "1");
  const redisUrlWithDatabase = `${redisUrl}/${workerId - 1}`;

  verbose = verbose ?? false;

  return new Promise((resolve, reject) => {
    const medusaProcess = spawn("node", [path.resolve(serverPath)], {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "development",
        JWT_SECRET: "test",
        COOKIE_SECRET: "test",
        REDIS_URL: redisUrl ? redisUrlWithDatabase : undefined, // If provided, will use a real instance, otherwise a fake instance
        UPLOAD_DIR: uploadDir, // If provided, will be used for the fake local file service
        ...env,
      },
      stdio: verbose
        ? ["inherit", "inherit", "inherit", "ipc"]
        : ["ignore", "ignore", "ignore", "ipc"],
    });

    medusaProcess.on("error", (err) => {
      console.log(err);
      process.exit();
    });

    medusaProcess.on("uncaughtException", (err) => {
      console.log(err);
      medusaProcess.kill();
    });

    medusaProcess.on(
      "message",
      ({ port, container }: { port: number; container: MedusaContainer }) => {
        const configModule: any = {
          featureFlags: {
            product_categories: true,
          },
          projectConfig: {
            database_type: "postgres",
            database_logging: false,
            database_url:
              "postgres://postgres:postgres@localhost:54321/medusa-docker",
            store_cors: "/.*/",
            admin_cors: "/.*/",
            database_database: ":memory:",
            jwt_secret: "SECRET",
            cookie_secret: "SECRET",
            stripe: {
              secret_key: process.env.STRIPE_API_KEY,
              webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
            },
          },
          modules: {
            cacheService: {
              resolve: "@medusajs/cache-inmemory",
              options: {
                ttl: 30,
              },
            },
            eventBus: {
              resolve: "@medusajs/event-bus-local",
            },
          },
          plugins: [],
        };
        // servicesLoader({ container, configModule, isTest: false });
        resolve({ medusaProcess, container, port });
      }
    );
  });
};
