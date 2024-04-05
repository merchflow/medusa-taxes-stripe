/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
const dockerCompose = require('docker-compose');
const path = require('path');

module.exports = async () => {
  await dockerCompose.down({
    cwd: path.join(__dirname),
  });
};
