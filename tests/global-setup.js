/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */

const dockerCompose = require('docker-compose');
const path = require('path');

module.exports = async () => {
  await dockerCompose.down({
    cwd: path.join(__dirname),
  });
  await dockerCompose.upAll({
    cwd: path.join(__dirname),
    log: true,
  });
  await dockerCompose.exec('postgres', ['sh', '-c', 'until pg_isready ; do sleep 1; done'], {
    cwd: path.join(__dirname),
  });

  // execSync('NODE_ENV=test npx knex migrate:rollback --all --env test');
  // execSync('NODE_ENV=test npx knex migrate:latest --env test');
};
