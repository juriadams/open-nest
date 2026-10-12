import "reflect-metadata";
import { afterAll, describe, expect, test } from "bun:test";
import {
  Body,
  Controller,
  Module,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { createFetcher } from "@/fetch";
import {
  AnyFilesInterceptor,
  FileInterceptor,
  FilesInterceptor,
} from "@/lib/multipart";
import type { UploadedFile as Upload } from "@/lib/request";

let sawBigFile = false;

@Controller()
class UploadController {
  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  upload(@UploadedFile() file: Upload, @Body() body: { title?: string }) {
    return {
      name: file.originalname,
      size: file.size,
      title: body.title,
    };
  }

  @Post("docs")
  @UseInterceptors(FilesInterceptor("docs", 2))
  docs(@UploadedFiles() files: Upload[]) {
    return files.map((file) => file.originalname);
  }

  @Post("any")
  @UseInterceptors(AnyFilesInterceptor())
  any(@UploadedFiles() files: Upload[], @Body() body: { note?: string }) {
    return { count: files.length, note: body.note };
  }

  @Post("big")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 4 } }))
  big() {
    sawBigFile = true;

    return { ok: true };
  }

  @Post("echo")
  echo(@Body() body: unknown) {
    return body;
  }
}

@Module({ controllers: [UploadController] })
class AppModule {}

describe("lib", () => {
  const fetch = createFetcher({
    module: AppModule,
    opts: { logger: false },
  });

  afterAll(() => fetch.close());

  describe("multipart", () => {
    test("one file and a text field", async () => {
      const form = new FormData();

      form.set("title", "hello");
      form.set("file", new File(["abc"], "a.txt", { type: "text/plain" }));

      const res = await fetch(
        new Request("http://localhost/upload", { method: "POST", body: form }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        name: "a.txt",
        size: 3,
        title: "hello",
      });
    });

    test("several files", async () => {
      const form = new FormData();

      form.append("docs", new File(["a"], "a.txt"));
      form.append("docs", new File(["b"], "b.txt"));

      const res = await fetch(
        new Request("http://localhost/docs", { method: "POST", body: form }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(["a.txt", "b.txt"]);
    });

    test("file over fileSize is 413", async () => {
      sawBigFile = false;

      const form = new FormData();

      form.set("file", new File(["abcdef"], "big.txt"));

      const res = await fetch(
        new Request("http://localhost/big", { method: "POST", body: form }),
      );

      expect(res.status).toBe(413);
      expect(sawBigFile).toBe(false);
    });

    test("JSON still parses", async () => {
      const res = await fetch(
        new Request("http://localhost/echo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ n: 1 }),
        }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ n: 1 });
    });

    test("any files interceptor", async () => {
      const form = new FormData();

      form.set("note", "hi");
      form.append("a", new File(["a"], "a.txt"));
      form.append("b", new File(["b"], "b.txt"));

      const res = await fetch(
        new Request("http://localhost/any", { method: "POST", body: form }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ count: 2, note: "hi" });
    });
  });
});
