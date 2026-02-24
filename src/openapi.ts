import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { send } from "micro";
import type { IncomingMessage, ServerResponse } from "http";

const specPath = path.join(__dirname, "..", "openapi.yaml");

const swaggerHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>FFHL Stats API</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: "BaseLayout"
      });
    </script>
  </body>
</html>`;

export const getOpenApiSpec = (_req: IncomingMessage, res: ServerResponse): void => {
  const raw = fs.readFileSync(specPath, "utf8");
  const spec = yaml.load(raw);
  res.setHeader("content-type", "application/json");
  send(res, 200, spec);
};

export const getSwaggerUi = (_req: IncomingMessage, res: ServerResponse): void => {
  res.setHeader("content-type", "text/html");
  send(res, 200, swaggerHtml);
};
