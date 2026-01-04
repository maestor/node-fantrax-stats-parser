module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/lambdas/**',
    '!src/types.ts',
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 97,  // Defensive programming branches in helpers.ts:43 and mappings.ts:24 are unreachable
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  coverageReporters: ['text', 'html', 'lcov'],
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['ts', 'js'],
  verbose: true,
};
