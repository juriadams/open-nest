import {
  VERSION_NEUTRAL,
  VersioningType,
  type VersioningOptions,
} from "@nestjs/common";
import type { VersionValue } from "@nestjs/common/interfaces/version-options.interface";

import type { FetchRequest } from "@/lib/request";
import type { FetchResponse } from "@/lib/response";

type Handler = (
  req: FetchRequest,
  res: FetchResponse,
  next: () => void,
) => unknown;

function headerValue(
  headers: FetchRequest["headers"],
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];

  if (Array.isArray(value)) return value[0];

  return value;
}

function matches(version: VersionValue, found: string | undefined): boolean {
  if (found == null) {
    return Array.isArray(version) && version.includes(VERSION_NEUTRAL);
  }

  if (Array.isArray(version)) return version.includes(found);

  return version === found;
}

function matchesCustom(
  version: VersionValue,
  extracted: string | string[],
): boolean {
  const values = Array.isArray(extracted) ? extracted : [extracted];

  if (values.length === 0) {
    return Array.isArray(version) && version.includes(VERSION_NEUTRAL);
  }

  if (Array.isArray(version)) {
    return values.some((value) => version.includes(value));
  }

  return typeof version === "string" && values.includes(version);
}

function mediaTypeVersion(
  accept: string | undefined,
  key: string,
): string | undefined {
  for (const range of accept?.split(",") ?? []) {
    for (const parameter of range.split(";").slice(1)) {
      const trimmed = parameter.trim();

      if (trimmed.startsWith(key)) return trimmed.slice(key.length);
    }
  }

  return undefined;
}

export function applyVersionFilter(
  handler: Handler,
  version: VersionValue,
  options: VersioningOptions,
): Handler {
  if (version === VERSION_NEUTRAL || options.type === VersioningType.URI) {
    return (req, res, next) => handler(req, res, next);
  }

  return (req, res, next) => {
    if (options.type === VersioningType.HEADER) {
      const found = headerValue(req.headers, options.header);

      if (matches(version, found)) return handler(req, res, next);

      return next();
    }

    if (options.type === VersioningType.MEDIA_TYPE) {
      const found = mediaTypeVersion(
        headerValue(req.headers, "accept"),
        options.key,
      );

      if (matches(version, found)) return handler(req, res, next);

      return next();
    }

    if (options.type === VersioningType.CUSTOM) {
      if (matchesCustom(version, options.extractor(req))) {
        return handler(req, res, next);
      }

      return next();
    }

    throw new Error("Unsupported versioning options");
  };
}
