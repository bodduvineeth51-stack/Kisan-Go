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

  export interface AuthError {
    code?: string
    message: string
  }

  export interface AuthAdmin {
    createUser(
      attrs: Record<string, unknown>,
    ): Promise<{ data: unknown; error: AuthError | null }>
    updateUserById(
      id: string,
      attrs: Record<string, unknown>,
    ): Promise<{ data: unknown; error: AuthError | null }>
    listUsers(params: {
      page: number
      perPage: number
    }): Promise<{
      data: { users: { id: string; phone?: string }[] }
      error: AuthError | null
    }>
    generateLink(params: {
      type: string
      email: string
    }): Promise<{
      data: { properties: { hashed_token: string; verification_type: string } }
      error: AuthError | null
    }>
  }

  export interface SupabaseClient {
    from(table: string): SupabaseQuery
    auth: { admin: AuthAdmin }
  }

  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): SupabaseClient
}

declare module 'https://esm.sh/jose@5' {
  export function createRemoteJWKSet(url: URL): unknown
  export function jwtVerify(
    token: string,
    keys: unknown,
    options: { issuer: string; audience: string },
  ): Promise<{ payload: Record<string, unknown> }>
}
