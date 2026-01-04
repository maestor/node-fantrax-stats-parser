# Gemini Code Understanding

## Project: node-fantrax-stats-parser

This document provides a high-level overview of the `node-fantrax-stats-parser` project, intended to be understood by a large language model.

## 1. Project Description

This project is a lightweight Node.js API server that parses NHL fantasy league team statistics from CSV files. The data is manually exported from the Fantrax fantasy sports platform. The primary purpose of this API is to serve combined and season-specific player and goalie stats as JSON, which can be consumed by a front-end application.

The project is built with TypeScript and uses the `micro` library for creating a lightweight HTTP server. It's designed to be a simple and efficient replacement for heavier frameworks like Express for specific use cases.

## 2. Key Technologies

- **Language:** TypeScript
- **Runtime:** Node.js
- **HTTP Server:** `micro`, `micro-cors`, `microrouter`
- **CSV Parsing:** `csvtojson`
- **Deployment:** AWS Lambda (indicated by `aws-lambda` and `aws-sdk` dependencies)
- **Development Tools:** `eslint`, `prettier`, `typescript`

## 3. Coding Style

The project enforces a consistent coding style through a combination of ESLint and Prettier.

- **Formatting**: Code formatting is handled by Prettier, which ensures a consistent style across the codebase. The `npm run format` command can be used to format the code.
- **Linting**: ESLint is used for static code analysis, with rules configured in `eslint.config.mjs`. The configuration extends the recommended rules from ESLint and TypeScript ESLint.
- **Key Linting Rules**:
    - **Variables**: `const` is preferred over `let`, and `var` is disallowed. Unused variables result in an error, unless prefixed with an underscore (`_`).
    - **Types**: The `any` type is discouraged and will raise a warning. Explicit function return types are not required.
    - **General**: `console` statements will raise a warning. Object shorthand and template literals are enforced.
- **TypeScript Usage**:
    - **Types**: The project makes extensive use of TypeScript for type safety. Type definitions are centralized in `src/types.ts`.
    - **Async/Await**: Asynchronous operations are handled using `async/await`.
- **Imports**: Imports are grouped at the top of each file.

## 4. Project Structure

The project is organized into the following key directories and files:

- **`src/`**: Contains the core application logic written in TypeScript.
  - **`index.ts`**: The main entry point of the application.
  - **`routes.ts`**: Defines the API routes and their handlers.
  - **`services.ts`**: Contains the business logic for fetching and parsing the stats data.
  - **`helpers.ts`**: Utility functions.
  - **`mappings.ts`**: Data mappings.
  - **`types.ts`**: TypeScript type definitions.
  - **`lambdas/`**: Contains the AWS Lambda function handlers, which are the primary entry points for the API when deployed.
- **`csv/`**: Stores the raw CSV data files, categorized by season and report type (regular season or playoffs).
- **`package.json`**: Lists the project's dependencies, scripts, and metadata.
- **`tsconfig.json`**: The TypeScript compiler configuration.
- **`README.md`**: The primary documentation for the project.

## 5. Core Functionality

The core functionality of this project is to parse CSV files and expose the data through a set of API endpoints.

### Data Parsing

The application reads CSV files from the `csv/` directory using the `csvtojson` library. The CSV files contain player and goalie statistics for different NHL seasons.

### API Endpoints

The API provides the following endpoints to access the parsed data:

- **`/seasons`**: Returns a list of available seasons.
- **`/players/season/:reportType/:season/:sortBy`**: Returns player stats for a specific season.
- **`/players/combined/:reportType/:sortBy`**: Returns combined player stats for all available seasons, including a `seasons` array with individual season stats.
- **`/goalies/season/:reportType/:season/:sortBy`**: Returns goalie stats for a specific season.
- **`/goalies/combined/:reportType/:sortBy`**: Returns combined goalie stats for all available seasons, including a `seasons` array with individual season stats.

The endpoints support parameters for filtering by `reportType` (regular or playoffs), `season`, and `sortBy` for sorting the results.

### Deployment

The project is set up to be deployed as AWS Lambda functions, as indicated by the presence of the `aws-lambda` and `aws-sdk` dependencies and the `lambdas/` directory.

## 6. How to Run

1.  Install Node.js (at least version 18.x is recommended).
2.  Clone the repository.
3.  Install dependencies with `npm install`.
4.  Lint the project with `npm run lint`.
5.  Build the project with `npm run build`.
6.  Run the development server with `npm run dev`.
7.  Access the API endpoints in your browser or with an API client.
