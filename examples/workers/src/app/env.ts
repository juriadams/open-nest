export interface Env {
  APP_NAME: string;

  // Simple KV Mock signature.
  CACHE: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
}
