import "reflect-metadata";
import { Readable } from "node:stream";
import { afterAll, describe, expect, test } from "bun:test";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  Redirect,
  Sse,
  SseSignal,
  StreamableFile,
  Version,
  VersioningType,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { createFetcher } from "@/fetch";

@Controller()
class TestController {
  @Get()
  hello() {
    return { ok: true };
  }

  @Post("echo")
  echo(@Body() body: unknown) {
    return body;
  }

  @Post("form")
  form(@Body() body: unknown) {
    return body;
  }

  @Get("empty")
  @HttpCode(204)
  empty() {}

  @Get("go")
  @Redirect("https://example.com", 302)
  go() {}

  @Get("file")
  file() {
    return new StreamableFile(fileStream);
  }

  @Sse("events")
  events() {
    return new Observable((subscriber) => {
      subscriber.next({ data: 0 });

      const id = setInterval(() => subscriber.next({ data: 1 }), 20);

      return () => {
        sseTornDown = true;
        clearInterval(id);
      };
    });
  }

  @Sse("signal")
  async signal(@SseSignal() signal: AbortSignal) {
    signal.addEventListener("abort", () => {
      sseSignalAborted = true;
    });

    await Bun.sleep(30);

    return new Observable(() => {});
  }

  @Get("live")
  live() {
    return new Observable((subscriber) => {
      liveStarted = true;

      const id = setInterval(() => subscriber.next({ n: 1 }), 20);

      return () => {
        liveUnsubscribed = true;
        clearInterval(id);
      };
    });
  }
}

let fileStream: Readable;
let sseTornDown = false;
let sseSignalAborted = false;
let liveStarted = false;
let liveUnsubscribed = false;

@Module({ controllers: [TestController] })
class AppModule {}

@Controller()
class PrefixController {
  @Get()
  hello() {
    return { ok: true };
  }
}

@Module({ controllers: [PrefixController] })
class PrefixModule {}

@Controller()
class HeaderVersionController {
  @Get()
  @Version("2")
  v2() {
    return { version: 2 };
  }
}

@Module({ controllers: [HeaderVersionController] })
class HeaderVersionModule {}

@Controller()
class MediaVersionController {
  @Get()
  @Version("2")
  v2() {
    return { version: 2 };
  }
}

@Module({ controllers: [MediaVersionController] })
class MediaVersionModule {}

@Controller()
class LimitController {
  @Post("echo")
  echo(@Body() body: unknown) {
    return body;
  }
}

@Module({ controllers: [LimitController] })
class LimitModule {}

describe("fetch", () => {
  const fetch = createFetcher({
    module: AppModule,
    opts: { logger: false },
  });
  const prefixed = createFetcher({
    module: PrefixModule,
    opts: { logger: false },
    configure: (app) => {
      app.setGlobalPrefix("api");
    },
  });
  const headerVersioned = createFetcher({
    module: HeaderVersionModule,
    opts: { logger: false },
    configure: (app) => {
      app.enableVersioning({
        type: VersioningType.HEADER,
        header: "X-Version",
      });
    },
  });
  const mediaVersioned = createFetcher({
    module: MediaVersionModule,
    opts: { logger: false },
    configure: (app) => {
      app.enableVersioning({
        type: VersioningType.MEDIA_TYPE,
        key: "v=",
      });
    },
  });
  const limited = createFetcher({
    module: LimitModule,
    opts: { logger: false },
    bodyLimit: 8,
  });

  afterAll(async () => {
    await Promise.all([
      fetch.close(),
      prefixed.close(),
      headerVersioned.close(),
      mediaVersioned.close(),
      limited.close(),
    ]);
  });

  test("GET /", async () => {
    const res = await fetch(new Request("http://localhost/"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("POST /echo", async () => {
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

  test("POST /form", async () => {
    const res = await fetch(
      new Request("http://localhost/form", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "n=1",
      }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ n: "1" });
  });

  test("unknown route", async () => {
    const res = await fetch(new Request("http://localhost/missing"));

    expect(res.status).toBe(404);
  });

  test("HttpCode 204", async () => {
    const res = await fetch(new Request("http://localhost/empty"));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  test("global prefix", async () => {
    const hit = await prefixed(new Request("http://localhost/api"));
    const miss = await prefixed(new Request("http://localhost/"));

    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual({ ok: true });
    expect(miss.status).toBe(404);
  });

  test("redirect", async () => {
    const res = await fetch(new Request("http://localhost/go"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com");
  });

  test("header versioning", async () => {
    const hit = await headerVersioned(
      new Request("http://localhost/", { headers: { "x-version": "2" } }),
    );
    const miss = await headerVersioned(
      new Request("http://localhost/", { headers: { "x-version": "1" } }),
    );

    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual({ version: 2 });
    expect(miss.status).toBe(404);
  });

  test("media type versioning", async () => {
    const hit = await mediaVersioned(
      new Request("http://localhost/", {
        headers: { accept: "application/json;v=2" },
      }),
    );
    const miss = await mediaVersioned(
      new Request("http://localhost/", {
        headers: { accept: "application/json;v=1" },
      }),
    );

    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual({ version: 2 });
    expect(miss.status).toBe(404);
  });

  test("StreamableFile yields before the source finishes", async () => {
    let finished = false;
    const stream = new Readable({ read() {} });

    stream.push("a");
    fileStream = stream;

    const res = await fetch(new Request("http://localhost/file"));
    const reader = res.body?.getReader();

    if (!reader) throw new Error("missing body");

    const first = await reader.read();

    expect(finished).toBe(false);
    expect(new TextDecoder().decode(first.value)).toBe("a");

    stream.push("b");
    stream.push(null);
    finished = true;

    const second = await reader.read();

    expect(new TextDecoder().decode(second.value)).toBe("b");
    await reader.cancel();
  });

  test("SSE unsubscribes when the client aborts", async () => {
    sseTornDown = false;

    const controller = new AbortController();
    const res = await fetch(
      new Request("http://localhost/events", { signal: controller.signal }),
    );
    const reader = res.body?.getReader();

    if (!reader) throw new Error("missing body");

    const decoder = new TextDecoder();
    let text = "";

    while (!text.includes("data: 0")) {
      const chunk = await reader.read();

      if (chunk.done) break;

      text += decoder.decode(chunk.value, { stream: true });
    }

    expect(text).toContain("data: 0");

    controller.abort();
    await reader.cancel();

    await Bun.sleep(20);

    expect(sseTornDown).toBe(true);
  });

  test("SseSignal aborts when the client leaves during setup", async () => {
    sseSignalAborted = false;

    const controller = new AbortController();
    const pending = fetch(
      new Request("http://localhost/signal", { signal: controller.signal }),
    );

    await Bun.sleep(10);
    controller.abort();
    await pending;

    expect(sseSignalAborted).toBe(true);
  });

  test("observable unsubscribes on abort", async () => {
    liveStarted = false;
    liveUnsubscribed = false;

    const controller = new AbortController();
    const pending = fetch(
      new Request("http://localhost/live", { signal: controller.signal }),
    );

    while (!liveStarted) await Bun.sleep(5);

    controller.abort();
    await pending;

    expect(liveUnsubscribed).toBe(true);
  });

  test("JSON over the body limit is 413", async () => {
    const res = await limited(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hello: "world" }),
      }),
    );

    expect(res.status).toBe(413);
  });

  test("malformed JSON is 400", async () => {
    const res = await fetch(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
  });

  test("cancelling the body destroys the piped readable", async () => {
    const stream = new Readable({ read() {} });
    const closed = new Promise<void>((resolve) => {
      stream.on("close", () => resolve());
    });

    stream.push("hello");
    fileStream = stream;

    const res = await fetch(new Request("http://localhost/file"));
    const reader = res.body?.getReader();

    if (!reader) throw new Error("missing body");

    await reader.read();
    await reader.cancel();

    await Promise.race([
      closed,
      Bun.sleep(500).then(() => {
        throw new Error("stream was not destroyed");
      }),
    ]);
  });
});
