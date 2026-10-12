import { Emitter } from "@/lib/events";

export class FetchSocket extends Emitter {
  destroyed = false;
  readable = true;
  writable = true;

  setKeepAlive(): void {}

  setNoDelay(): void {}

  setTimeout(): void {}

  close(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.emit("close");
  }
}

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Uint8Array;
  size: number;
}

export interface FetchRequest {
  raw: Request;
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  body: unknown;
  /**
   * Set when a parser has consumed the body, or when a middleware wants later
   * parsers to leave the stream unread.
   */
  _body?: boolean;
  rawBody?: Uint8Array;
  ip: string;
  hostname: string;
  socket: FetchSocket;
  file?: UploadedFile;
  files?: UploadedFile[];
}

export function createRequest(
  input: Request,
  socket: FetchSocket,
): FetchRequest {
  const url = new URL(input.url);
  const headers: Record<string, string | string[]> = {};

  input.headers.forEach((value, key) => {
    const prev = headers[key];

    if (prev == null) headers[key] = value;
    else if (Array.isArray(prev)) prev.push(value);
    else headers[key] = [prev, value];
  });

  const query: Record<string, string | string[]> = {};

  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    const first = all[0];

    if (first == null) continue;

    query[key] = all.length > 1 ? all : first;
  }

  const forwarded = input.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const host = input.headers.get("host") ?? url.hostname;

  return {
    raw: input,
    method: input.method.toUpperCase(),
    url: url.pathname + url.search,
    originalUrl: url.pathname + url.search,
    path: url.pathname,
    headers,
    query,
    params: {},
    body: undefined,
    ip: forwarded ?? "",
    hostname: host.split(":")[0] ?? "",
    socket,
  };
}
