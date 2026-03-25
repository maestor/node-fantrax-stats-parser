import type { ServerResponse } from "http";

const hasContentType = (res: ServerResponse): boolean =>
  res.hasHeader("content-type");

const setDefaultContentType = (
  res: ServerResponse,
  contentType: string,
): void => {
  if (!hasContentType(res)) {
    res.setHeader("content-type", contentType);
  }
};

export const send = (
  res: ServerResponse,
  status: number,
  body: unknown,
): void => {
  res.statusCode = status;

  if (body === undefined) {
    res.end();
    return;
  }

  if (typeof body === "string") {
    setDefaultContentType(res, "text/plain; charset=utf-8");
    res.end(body);
    return;
  }

  if (body instanceof Uint8Array) {
    setDefaultContentType(res, "application/octet-stream");
    res.end(body);
    return;
  }

  setDefaultContentType(res, "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};
