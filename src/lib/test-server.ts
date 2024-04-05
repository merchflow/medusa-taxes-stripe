import { bootstrapApp } from "./bootstrap-app";

const setupTestServer = async () => {
  const { container, dbConnection, app, port } = await bootstrapApp();

  app.listen(port, () => {
    process.send({ port, container });
  });

  return { container, dbConnection, app, port };
};

setupTestServer()