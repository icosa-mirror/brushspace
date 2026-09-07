# Brushspace archive download proxy

Separate Worker in the Icosa Gallery Ltd account; does not modify the existing
`cors` or `icosa-proxy` Workers. Only archived Poly `.tilt` downloads are allowed.
Public GET responses allow all browser origins. Requests do not forward cookies
or authorization. Redirects are revalidated, downloads time out after 45 seconds,
and files over 32 MiB are rejected. Successful downloads are cached at each
Cloudflare edge location for one day. HTTP 429 responses receive a bounded
15–600 second edge cooldown using Retry-After (60 seconds by default), so repeat
requests do not keep hitting a rate-limited upstream. Archive rate limits are returned as HTTP 429;
this proxy cannot bypass upstream rate limits or recover missing files.

1. `npm run dev` serves the same handler at `/api/tilt-proxy` locally. No Cloudflare
   credentials are needed for local development.
2. `wrangler dev --config workers/tilt-proxy/wrangler.jsonc` tests the Worker runtime.
3. `wrangler deploy --config workers/tilt-proxy/wrangler.jsonc` deploys only this Worker.
4. CI deploys on relevant changes to `main` or manual dispatch. Configure the
   repository secret `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit permission
   scoped to the Icosa Gallery Ltd account before running that workflow.
   Without the secret, CI still runs validation and explicitly reports that
   deployment was skipped; the already-deployed Worker is left unchanged.

Production defaults to
`https://brushspace-tilt-proxy.icosa-gallery-ltd.workers.dev/api/tilt-proxy`.
Set `VITE_TILT_PROXY_URL` at build/dev startup to override the endpoint.
Backblaze downloads remain direct. The endpoint takes a URL-encoded `url` query
parameter; it is not a general-purpose CORS proxy.
