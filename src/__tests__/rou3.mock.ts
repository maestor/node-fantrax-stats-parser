type RouteEntry<TData> = {
  data: TData;
  method: string;
  path: string;
};

type Router<TData> = {
  routes: RouteEntry<TData>[];
};

export type MatchedRoute<TData> = {
  data: TData;
  params?: Record<string, string>;
};

export const createRouter = <TData>(): Router<TData> => ({
  routes: [],
});

export const addRoute = <TData>(
  router: Router<TData>,
  method: string,
  path: string,
  data: TData,
): void => {
  router.routes.push({ method, path, data });
};

const matchRoute = (
  pattern: string,
  pathname: string,
): Record<string, string> | null => {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = {};

  let patternIndex = 0;
  let pathIndex = 0;

  while (patternIndex < patternSegments.length) {
    const patternSegment = patternSegments[patternIndex];

    if (patternSegment === "**") {
      return params;
    }

    const pathSegment = pathSegments[pathIndex];
    if (pathSegment === undefined) {
      return null;
    }

    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = pathSegment;
    } else if (patternSegment !== pathSegment) {
      return null;
    }

    patternIndex += 1;
    pathIndex += 1;
  }

  return pathIndex === pathSegments.length ? params : null;
};

export const findRoute = <TData>(
  router: Router<TData>,
  method: string | undefined,
  pathname: string,
  _options?: { params?: boolean },
): MatchedRoute<TData> | undefined => {
  if (!method) {
    return undefined;
  }

  for (const route of router.routes) {
    if (route.method !== method) {
      continue;
    }

    const params = matchRoute(route.path, pathname);
    if (params) {
      return {
        data: route.data,
        params: Object.keys(params).length > 0 ? params : undefined,
      };
    }
  }

  return undefined;
};
