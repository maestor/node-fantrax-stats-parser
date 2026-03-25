import { createServer } from "http";

import app from "./app.js";

const port = Number(process.env.PORT) || 3000;

createServer((req, res) => {
  void Promise.resolve(app(req, res)).catch((error: unknown) => {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : "Internal Server Error");
  });
}).listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on http://localhost:${port}`);
});
