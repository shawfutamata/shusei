export function GET(request: Request) {
  return Response.redirect(new URL('/login', request.url), 308);
}
