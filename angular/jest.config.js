module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    '!src/lib/**/*.spec.ts',
    '!src/lib/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['html', 'text', 'lcov'],
  transform: {
    '^.+\\.(ts|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
      },
    ],
  },
  moduleNameMapper: {
    '^@erghi/angular$': '<rootDir>/src/public-api.ts',
  },
};
