import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  verbose: true,
  preset: "ts-jest",
  testEnvironment: "node",
  // testMatch: ["**/?(*.)+(test).ts"],
  resetMocks: true,
  clearMocks: true,
  coverageDirectory: "./tests/coverage",
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/node_modules/", '/dist/'],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  setupFiles: [],
  setupFilesAfterEnv: ["@alex_neo/jest-expect-message"],
  globalSetup: "./tests/global-setup.js",
  globalTeardown: "./tests/global-teardown.js",
  testTimeout: 15000,
  // rootDir: "src",
  testRegex: "(/__tests__/.*|\\.(test|spec))\\.(ts|js)$",
  transform: {
    ".ts": [
      "ts-jest",
      {
        tsconfig: "tsconfig.spec.json",
      },
    ],
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
};

export default config;
