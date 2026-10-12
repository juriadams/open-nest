export interface GatewayClient {
  send(data: string): void;
  data: { path: string };
}

interface Gateway {
  path: string;
  connect?: (client: GatewayClient) => void;
}

interface MessageHandler {
  message: string;
  callback: (data: unknown) => unknown;
}

interface Subscription {
  unsubscribe(): void;
}

interface ResultStream {
  subscribe(observer: {
    next: (value: unknown) => void;
    error?: (error: unknown) => void;
  }): Subscription;
}

interface ClientState {
  handlers: MessageHandler[];
  transform: (result: unknown) => ResultStream;
  subscriptions: Subscription[];
  onClose?: () => void;
}

export function gatewayPath(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;

  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  return path;
}

/**
 * Records Nest gateways during `init`. The runtime server performs the upgrade.
 */
export class WsGateway<T extends GatewayClient = GatewayClient> {
  private readonly gateways: Gateway[] = [];
  private readonly clients = new WeakMap<T, ClientState>();

  create(_port: number, options?: { path?: string }): Gateway {
    const gateway: Gateway = { path: gatewayPath(options?.path ?? "/") };

    this.gateways.push(gateway);

    return gateway;
  }

  bindClientConnect(server: Gateway, callback: (client: T) => void): void {
    server.connect = callback as (client: GatewayClient) => void;
  }

  bindMessageHandlers(
    client: T,
    handlers: MessageHandler[],
    transform: (result: unknown) => ResultStream,
  ): void {
    const prev = this.clients.get(client);

    this.clients.set(client, {
      handlers,
      transform,
      subscriptions: prev?.subscriptions ?? [],
      onClose: prev?.onClose,
    });
  }

  bindClientDisconnect(client: T, callback: () => void): void {
    const state = this.clients.get(client);

    if (!state) return;

    state.onClose = callback;
  }

  close(): void {}

  matches(pathname: string): boolean {
    const path = gatewayPath(pathname);

    return this.gateways.some((gateway) => gateway.path === path);
  }

  hasGateways(): boolean {
    return this.gateways.length > 0;
  }

  open(client: T): void {
    const gateway = this.gateways.find(
      (item) => item.path === client.data.path,
    );

    gateway?.connect?.(client);
  }

  receive(client: T, raw: string | Uint8Array): void {
    const state = this.clients.get(client);

    if (!state) return;

    let event: string;
    let data: unknown;

    try {
      const text =
        typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      const parsed = JSON.parse(text) as { event?: unknown; data?: unknown };

      if (typeof parsed.event !== "string") return;

      event = parsed.event;
      data = parsed.data;
    } catch {
      return;
    }

    const handler = state.handlers.find((item) => item.message === event);

    if (!handler) return;

    let stream: ResultStream;

    try {
      stream = state.transform(handler.callback(data));
    } catch {
      return;
    }

    const subscription = stream.subscribe({
      next: (value) => {
        if (value === undefined) return;

        client.send(JSON.stringify({ event, data: value }));
      },
      error: () => {},
    });

    state.subscriptions.push(subscription);
  }

  closed(client: T): void {
    const state = this.clients.get(client);

    if (!state) return;

    for (const subscription of state.subscriptions) subscription.unsubscribe();

    state.onClose?.();
    this.clients.delete(client);
  }
}
