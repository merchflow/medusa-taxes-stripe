// https://github.com/medusajs/medusa/blob/master/integration-tests/environment-helpers/bootstrap-app.js

import loaders from '@medusajs/medusa/dist/loaders';
import * as express from 'express';
import * as path from 'path';

async function bootstrapApp({ cwd = null } = {}) {
  const app = express()

  const { container, dbConnection } = await loaders({
    directory: path.resolve(cwd || process.cwd()),
    expressApp: app,
    isTest: false,
  })

  return {
    container,
    app,
    dbConnection,
    port: 9000,
  }
}

export {
  bootstrapApp
};

