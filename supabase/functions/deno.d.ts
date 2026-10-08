// Ambient types for the Supabase edge functions.
//
// These functions run on Supabase's Deno runtime, which provides the `Deno`
// global and resolves `https://` imports. A plain TypeScript language server
// (VS Code's default for this project) knows neither, so it flags both as
// errors. These declarations exist only to quiet the editor — nothing here is
// bundled or deployed, and the real implementations come from the runtime.
//
// If you install the Deno extension (denoland.vscode-deno) and enable it for
// ./supabase/functions, delete this file: Deno ships the real types.

declare namespace Deno {
  export const env: {
    get(key: string): string | undefined
  }
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  /** Loose stand-in for the real client — enough for the edge functions. */
  export interface SupabaseQuery
    extends PromiseLike<{ data: unknown; error: unknown }> {
    select(columns?: string): SupabaseQuery
    insert(values: Record<string, unknown>): SupabaseQuery
    update(values: Record<string, unknown>): SupabaseQuery
    eq(column: string, value: unknown): SupabaseQuery
    single(): SupabaseQuery
  }

  export interface SupabaseClient {
    from(table: string): SupabaseQuery
  }

  export function createClient(url: string, key: string): SupabaseClient
}
