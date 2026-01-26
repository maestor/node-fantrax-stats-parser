module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/playwright/**",
    "!src/types.ts",
    "!src/index.ts",
    "!src/server.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  coverageReporters: ["text", "html", "lcov"],
  coverageDirectory: "coverage",
  moduleFileExtensions: ["ts", "js"],
  verbose: true,
  transform: {
    "^.+\\.ts$": [
      "ts-jest"
    ],
  },
};
