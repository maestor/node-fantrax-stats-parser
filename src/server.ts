import { createServer } from "http";
import { serve } from "micro";

import app from "./app";

const port = Number(process.env.PORT) || 3000;

createServer(serve(app)).listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on http://localhost:${port}`);
});
