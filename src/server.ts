import { createServer } from "http";
import { serve } from "micro";

// NOTE: `src/index.ts` exports the request handler via CommonJS (module.exports)
// because it's also used by the `micro` CLI. Importing it like this works with
// `esModuleInterop` and `module: commonjs`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const handler = require("./index");

const port = Number(process.env.PORT) || 3000;

createServer(serve(handler)).listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on http://localhost:${port}`);
});
