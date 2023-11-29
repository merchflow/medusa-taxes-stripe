import apiLoader from "@medusajs/medusa/dist/loaders/api";
import databaseLoader, {
  dataSource,
} from "@medusajs/medusa/dist/loaders/database";
import defaultsLoader from "@medusajs/medusa/dist/loaders/defaults";
import expressLoader from "@medusajs/medusa/dist/loaders/express";
import featureFlagsLoader from "@medusajs/medusa/dist/loaders/feature-flags";
import Logger from "@medusajs/medusa/dist/loaders/logger";
import modelsLoader from "@medusajs/medusa/dist/loaders/models";
import passportLoader from "@medusajs/medusa/dist/loaders/passport";
import pluginsLoader, {
  registerPluginModels,
} from "@medusajs/medusa/dist/loaders/plugins";
import redisLoader from "@medusajs/medusa/dist/loaders/redis";
import repositoriesLoader from "@medusajs/medusa/dist/loaders/repositories";
import searchIndexLoader from "@medusajs/medusa/dist/loaders/search-index";
import servicesLoader from "@medusajs/medusa/dist/loaders/services";
import strategiesLoader from "@medusajs/medusa/dist/loaders/strategies";
import subscribersLoader from "@medusajs/medusa/dist/loaders/subscribers";
import { asValue } from "awilix";
import { Express, NextFunction, Request, Response } from "express";
import * as express from "express";
import "reflect-metadata";
const dotenv = require("dotenv");
import { ConfigModule } from "@medusajs/medusa";
import { moduleLoader, registerMedusaModule, registerMedusaLinkModule } from "@medusajs/modules-sdk";
import axios from "axios";
import { createMedusaContainer } from "medusa-core-utils";

export const medusaInitialize = async () => {
  const PORT = 9000;
  const rootDirectory = process.cwd();
  const app: Express = express();

  dotenv.config({ path: rootDirectory + "/.env.test" });

  // To mute the logger i override the logger with a dummy logger
  const logger = {
    info: () => null,
    error: () => null,
    warn: () => null,
    progress: () => null,
  } as any;

  const container = createMedusaContainer();

  type ExtendedConfigModule = ConfigModule & {
    modules?: Record<string, false | any>;
    projectConfig: {
      stripe: {
        secret_key: string;
        webhook_secret: string;
      };
    };
  };

  const configModule: ExtendedConfigModule = {
    featureFlags: {
      product_categories: true,
    },
    projectConfig: {
      database_type: "postgres",
      database_logging: false,
      database_url: "postgres://postgres:postgres@localhost:54321/medusa-docker",
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
        resolve: "@medusajs/event-bus-redis",
        options: {
          redisUrl: process.env.REDIS_URL,
        }
      },
    },
    plugins: [],
  };

  container.register("configModule", asValue(configModule));

  const featureFlagRouter = featureFlagsLoader(configModule, logger);
  container.register({
    logger: asValue(logger),
    featureFlagRouter: asValue(featureFlagRouter),
  });

  await redisLoader({ container, configModule, logger });

  modelsLoader({ container });

  await registerPluginModels({
    rootDirectory,
    container,
    configModule,
  });

  strategiesLoader({ container, configModule, isTest: false });

  await moduleLoader({
    container,
    moduleResolutions: registerMedusaModule(configModule.modules.cacheService),
    logger: logger,
  });

  await moduleLoader({
    container,
    moduleResolutions: registerMedusaModule(configModule.modules.eventBus),
    logger: logger,
  });

  const dbConnection = await databaseLoader({
    container,
    configModule,
  });

  repositoriesLoader({ container });

  container.register({ manager: asValue(dataSource.manager) });

  servicesLoader({ container, configModule, isTest: false });

  await expressLoader({ app: app, configModule });
  await passportLoader({ app: app, container, configModule });

  // Add the registered services to the request scope
  app.use((req: Request, res: Response, next: NextFunction) => {
    container.register({ manager: asValue(dataSource.manager) });
    (req as any).scope = container.createScope();
    next();
  });

  await pluginsLoader({
    container,
    rootDirectory,
    configModule,
    app: app,
    activityId: null,
  });

  subscribersLoader({ container });

  await apiLoader({ container, app: app, configModule });

  await defaultsLoader({ container });

  await searchIndexLoader({ container });

  const httpServer = app.listen(PORT);

  // Awaiting until server is ready
  await new Promise(async (resolve) => {
    let signal: NodeJS.Timeout;
    signal = setInterval(async () => {
      const response = await axios
        .get(`http://localhost:${PORT}/health`)
        .catch((e) => null);
      if (response) {
        clearTimeout(signal);
        resolve(true);
      }
    }, 1000);
  });

  return {
    container,
    dbConnection,
    httpServer,
  };
};
