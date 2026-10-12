import { errorStatus, mountedUrl } from "@/lib/express";
import type { FetchRequest } from "@/lib/request";
import type { FetchResponse } from "@/lib/response";

export type Next = (err?: unknown) => void;

type Handler = (req: FetchRequest, res: FetchResponse, next: Next) => unknown;

type ErrorHandler = (
  err: unknown,
  req: FetchRequest,
  res: FetchResponse,
  next: Next,
) => unknown;

type Callback = Handler | ErrorHandler;

interface Layer {
  method: string | null;
  mount: string | null;
  match: (pathname: string) => Record<string, string> | null;
  handler: Callback;
  error: boolean;
}

const TOKEN =
  /:([A-Za-z_][A-Za-z0-9_]*)(\?)?|\{\*([A-Za-z_][A-Za-z0-9_]*)\}|\*([A-Za-z_][A-Za-z0-9_]*)/g;

function normalizeMount(path: string): string {
  let source = path.endsWith("$") ? path.slice(0, -1) : path;

  if (!source.startsWith("/")) source = `/${source}`;

  if (source.length > 1 && source.endsWith("/")) source = source.slice(0, -1);

  return source;
}

function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compile(
  path: string,
  kind: "exact" | "prefix",
): (pathname: string) => Record<string, string> | null {
  const exact = kind === "exact" || path.endsWith("$");
  let source = path.endsWith("$") ? path.slice(0, -1) : path;

  if (!source.startsWith("/")) source = `/${source}`;

  if (/[()+]/.test(source) || /(?:^|\/)\*(?![A-Za-z_{])/.test(source)) {
    throw new TypeError(
      `Unsupported route path "${path}". Use :param, :param?, {*name}, or *name.`,
    );
  }

  let pattern = "^";
  let cursor = 0;

  for (const token of source.matchAll(TOKEN)) {
    const index = token.index ?? 0;

    pattern += escapeLiteral(source.slice(cursor, index));

    const braceSplat = token[3];
    const starSplat = token[4];
    const name = token[1] ?? braceSplat ?? starSplat ?? "path";
    const optional = token[2] === "?";

    if (braceSplat != null || optional) {
      if (pattern.endsWith("/")) pattern = pattern.slice(0, -1);

      pattern +=
        braceSplat != null ? `(?:/(?<${name}>.*))?` : `(?:/(?<${name}>[^/]+))?`;
    } else if (starSplat != null) {
      pattern += `(?<${name}>.*)`;
    } else {
      pattern += `(?<${name}>[^/]+)`;
    }

    cursor = index + token[0].length;
  }

  pattern += escapeLiteral(source.slice(cursor));

  if (source === "/") pattern = exact ? "^/?$" : "^/.*$";
  else pattern += exact ? "/?$" : "(?:/.*)?$";

  const re = new RegExp(pattern);

  return (pathname) => {
    const found = re.exec(pathname);

    if (!found) return null;

    const params: Record<string, string> = {};

    for (const [key, value] of Object.entries(found.groups ?? {})) {
      if (value != null) params[key] = value;
    }

    return params;
  };
}

export class Router {
  private layers: Layer[] = [];

  use(handler: Handler): void;
  use(path: string | string[], handler: Handler): void;
  use(handler: ErrorHandler): void;
  use(path: string | string[], handler: ErrorHandler): void;
  use(pathOrHandler: string | string[] | Callback, handler?: Callback): void {
    if (Array.isArray(pathOrHandler)) {
      for (const path of pathOrHandler) this.add(null, path, handler, "prefix");

      return;
    }

    this.add(null, pathOrHandler, handler, "prefix");
  }

  get(path: string | Handler, handler?: Handler): void {
    this.add("GET", path, handler, "exact");
  }

  post(path: string | Handler, handler?: Handler): void {
    this.add("POST", path, handler, "exact");
  }

  head(path: string | Handler, handler?: Handler): void {
    this.add("HEAD", path, handler, "exact");
  }

  delete(path: string | Handler, handler?: Handler): void {
    this.add("DELETE", path, handler, "exact");
  }

  put(path: string | Handler, handler?: Handler): void {
    this.add("PUT", path, handler, "exact");
  }

  patch(path: string | Handler, handler?: Handler): void {
    this.add("PATCH", path, handler, "exact");
  }

  options(path: string | Handler, handler?: Handler): void {
    this.add("OPTIONS", path, handler, "exact");
  }

  all(path: string | Handler, handler?: Handler): void {
    this.add(null, path, handler, "exact");
  }

  propfind(path: string | Handler, handler?: Handler): void {
    this.add("PROPFIND", path, handler, "exact");
  }

  proppatch(path: string | Handler, handler?: Handler): void {
    this.add("PROPPATCH", path, handler, "exact");
  }

  mkcol(path: string | Handler, handler?: Handler): void {
    this.add("MKCOL", path, handler, "exact");
  }

  copy(path: string | Handler, handler?: Handler): void {
    this.add("COPY", path, handler, "exact");
  }

  move(path: string | Handler, handler?: Handler): void {
    this.add("MOVE", path, handler, "exact");
  }

  lock(path: string | Handler, handler?: Handler): void {
    this.add("LOCK", path, handler, "exact");
  }

  unlock(path: string | Handler, handler?: Handler): void {
    this.add("UNLOCK", path, handler, "exact");
  }

  search(path: string | Handler, handler?: Handler): void {
    this.add("SEARCH", path, handler, "exact");
  }

  query(path: string | Handler, handler?: Handler): void {
    this.add("QUERY", path, handler, "exact");
  }

  add(
    method: string | null,
    path: string | Callback,
    handler: Callback | undefined,
    kind: "exact" | "prefix",
  ): void {
    const fn = typeof path === "function" ? path : handler;
    const route = typeof path === "function" ? "/" : path;

    if (!fn) return;

    const mount = kind === "prefix" ? normalizeMount(route) : null;

    this.layers.push({
      method,
      mount,
      match: compile(route, kind),
      handler: fn,
      error: fn.length >= 4,
    });
  }

  handle(req: FetchRequest, res: FetchResponse): void {
    const dispatch = (index: number, err?: unknown): void => {
      const layer = this.layers[index];

      if (!layer) {
        if (!res.headersSent) {
          const status = err ? (errorStatus(err) ?? 500) : 404;
          const message =
            err &&
            typeof err === "object" &&
            "message" in err &&
            typeof err.message === "string"
              ? err.message
              : err
                ? "Internal server error"
                : "Not Found";

          res.status(status).json({ statusCode: status, message });
        }

        return;
      }

      if (err) {
        if (!layer.error) return dispatch(index + 1, err);

        Promise.resolve()
          .then(() =>
            (layer.handler as ErrorHandler)(err, req, res, (nextErr) =>
              dispatch(index + 1, nextErr),
            ),
          )
          .catch((nextErr) => dispatch(index + 1, nextErr));

        return;
      }

      if (layer.error) return dispatch(index + 1);

      if (layer.method && layer.method !== req.method)
        return dispatch(index + 1);

      const params = layer.match(req.path);

      if (!params) return dispatch(index + 1);

      req.params = params;

      const previous = req.url;

      if (layer.mount && layer.mount !== "/")
        req.url = mountedUrl(previous, layer.mount);

      const restore = () => {
        req.url = previous;
      };

      Promise.resolve()
        .then(() =>
          (layer.handler as Handler)(req, res, (nextErr) => {
            restore();
            dispatch(index + 1, nextErr);
          }),
        )
        .catch((nextErr) => {
          restore();
          dispatch(index + 1, nextErr);
        });
    };

    dispatch(0);
  }
}
