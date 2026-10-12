import {
  RequestMethod,
  type INestApplication,
  type NestApplicationOptions,
  type Type,
  type VersioningOptions,
} from "@nestjs/common";
import type { VersionValue } from "@nestjs/common/interfaces/version-options.interface";
import { AbstractHttpAdapter } from "@nestjs/core";

import { type FetchRequest } from "@/lib/request";
import { FetchResponse } from "@/lib/response";
import { Router } from "@/lib/router";
export interface CorsOptions {
  origin?:
    | boolean
    | string
    | RegExp
    | Array<string | RegExp>
    | ((origin: string) => boolean);
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
}
/**
 * Options for {@link createFetcher}.
 */
export interface CreateHandlerOptions {
  /**
   * Root Nest module.
   */
  module: Type<unknown>;
  /**
   * Runs after the app is created and before init.
   */
  configure?: (app: INestApplication) => void | Promise<void>;
  /**
   * Forwarded to `NestFactory.create`.
   */
  opts?: NestApplicationOptions;
  /**
   * Max JSON or urlencoded body size in bytes. Defaults to 1 MiB.
   */
  bodyLimit?: number;
}
export interface Fetcher {
  (request: Request): Promise<Response>;
  /**
   * Resolves the underlying Nest app instance.
   */
  app(): Promise<INestApplication>;
  /**
   * Closes the underlying Nest app.
   */
  close(): Promise<void>;
}
export declare class FetchAdapter extends AbstractHttpAdapter<
  undefined,
  FetchRequest,
  FetchResponse
> {
  private bodyLimit;
  private rawBody;
  private shuttingDown;
  private parsersReady;
  constructor();
  protected get router(): Router;
  handle(input: Request): Promise<Response>;
  listen(): never;
  initHttpServer(options: NestApplicationOptions): void;
  beforeClose(): void;
  close(): void;
  useStaticAssets(
    _root?: string,
    _options?: {
      prefix?: string;
      index?: string | false;
    },
  ): this;
  setViewEngine(): this;
  getRequestHostname(request: FetchRequest): string;
  getRequestMethod(request: FetchRequest): string;
  getRequestUrl(request: FetchRequest): string;
  status(response: FetchResponse, statusCode: number): FetchResponse;
  reply(response: FetchResponse, body: unknown, statusCode?: number): void;
  end(response: FetchResponse, message?: string): void;
  render(): never;
  redirect(response: FetchResponse, statusCode: number, url: string): void;
  isHeadersSent(response: FetchResponse): boolean;
  getHeader(response: FetchResponse, name: string): string | null;
  setHeader(response: FetchResponse, name: string, value: string): void;
  appendHeader(response: FetchResponse, name: string, value: string): void;
  setErrorHandler(handler: Function): void;
  setNotFoundHandler(handler: Function): void;
  getType(): string;
  isRouteOrderSensitive(): boolean;
  applyVersionFilter(
    handler: Function,
    version: VersionValue,
    versioningOptions: VersioningOptions,
  ): (req: FetchRequest, res: FetchResponse, next: () => void) => Function;
  createMiddlewareFactory(
    method: RequestMethod,
  ): (path: string, callback: Function) => void;
  registerParserMiddleware(): void;
  enableCors(options?: CorsOptions): void;
  setBodyLimit(limit: number): void;
}
export declare function createFetcher(
  { module, configure, opts, bodyLimit }: CreateHandlerOptions,
  adapter?: FetchAdapter,
): Fetcher;
export {
  AnyFilesInterceptor,
  FileInterceptor,
  FilesInterceptor,
  type MultipartLimits,
  type MultipartOptions,
} from "@/lib/multipart";
export { gatewayPath, WsGateway, type GatewayClient } from "@/lib/gateway";
