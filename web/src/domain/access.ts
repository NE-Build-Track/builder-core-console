/** The login pages and builder's own API stay reachable; every other page is operator-only in production. */
export function isStackReadPath(pathname: string): boolean {
  return !["/operator", "/builder", "/auth"].some((root) => pathname === root || pathname.startsWith(`${root}/`)) &&
    pathname !== "/livez";
}
