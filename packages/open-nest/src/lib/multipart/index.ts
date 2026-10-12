import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  mixin,
  type NestInterceptor,
  PayloadTooLargeException,
  type Type,
} from "@nestjs/common";
import type { Observable } from "rxjs";

import type { FetchRequest, UploadedFile } from "@/lib/request";

export interface MultipartLimits {
  fileSize?: number;
  files?: number;
  fields?: number;
}

export interface MultipartOptions {
  limits?: MultipartLimits;
}

async function readForm(
  req: FetchRequest,
  limits: MultipartLimits | undefined,
): Promise<UploadedFile[]> {
  const type = req.raw.headers.get("content-type") ?? "";

  if (!type.toLowerCase().includes("multipart/form-data")) {
    throw new BadRequestException("Expected multipart/form-data");
  }

  const form = await req.raw.formData();
  const body: Record<string, string | string[]> = {};
  const files: UploadedFile[] = [];
  let fields = 0;

  for (const [fieldname, value] of form.entries()) {
    if (typeof value === "string") {
      fields += 1;

      if (limits?.fields != null && fields > limits.fields) {
        throw new PayloadTooLargeException();
      }

      const prev = body[fieldname];

      if (prev == null) body[fieldname] = value;
      else if (Array.isArray(prev)) prev.push(value);
      else body[fieldname] = [prev, value];

      continue;
    }

    if (limits?.files != null && files.length >= limits.files) {
      throw new PayloadTooLargeException();
    }

    const buffer = new Uint8Array(await value.arrayBuffer());

    if (limits?.fileSize != null && buffer.byteLength > limits.fileSize) {
      throw new PayloadTooLargeException();
    }

    files.push({
      fieldname,
      originalname: value.name,
      encoding: "7bit",
      mimetype: value.type,
      buffer,
      size: buffer.byteLength,
    });
  }

  req.body = body;

  return files;
}

export function FileInterceptor(
  field: string,
  options?: MultipartOptions,
): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const req = context.switchToHttp().getRequest<FetchRequest>();
      const files = await readForm(req, options?.limits);
      const file = files.find((item) => item.fieldname === field);

      if (file) req.file = file;

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}

export function FilesInterceptor(
  field: string,
  maxCount?: number,
  options?: MultipartOptions,
): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const req = context.switchToHttp().getRequest<FetchRequest>();
      const files = await readForm(req, options?.limits);
      const matched = files.filter((item) => item.fieldname === field);

      if (maxCount != null && matched.length > maxCount) {
        throw new PayloadTooLargeException();
      }

      req.files = matched;

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}

export function AnyFilesInterceptor(
  options?: MultipartOptions,
): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const req = context.switchToHttp().getRequest<FetchRequest>();

      req.files = await readForm(req, options?.limits);

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
