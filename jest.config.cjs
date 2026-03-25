module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/jest.setup.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/__tests__/**",
    "!src/playwright/**",
    "!src/types.ts",
    "!src/index.ts",
    "!src/server.ts",
    "!src/db/client.ts", // Turso/libSQL client wrapper - tested via integration tests
  ],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  coverageReporters: ["text", "html", "lcov"],
  coverageDirectory: "coverage",
  moduleFileExtensions: ["ts", "js"],
  moduleNameMapper: {
    "^rou3$": "<rootDir>/src/__tests__/rou3.mock.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  verbose: true,
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
};
