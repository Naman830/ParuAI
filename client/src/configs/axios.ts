import axios from 'axios'

/**
 * Single source of truth for the API origin.
 *
 * `client/.env` ships empty, so VITE_BASEURL is often undefined. Previously
 * only axios had a fallback while auth-client passed `baseURL: undefined` and
 * defaulted to the page origin (:5173) — so API calls went to the server and
 * auth calls went to the Vite dev server, and every login 404'd.
 */
export const API_BASE_URL =
    import.meta.env.VITE_BASEURL || 'http://localhost:3000'

// The localhost fallback is right for dev and actively harmful in a deployed
// build: VITE_* is inlined at build time, so a Vercel deploy missing
// VITE_BASEURL ships a bundle that calls the visitor's own machine, and every
// request fails as an opaque network error rather than anything traceable.
if (import.meta.env.PROD && !import.meta.env.VITE_BASEURL) {
    console.error(
        '[ParuAI] VITE_BASEURL is not set in this production build, so API ' +
        'calls are pointed at http://localhost:3000 and will all fail. Set it ' +
        'in your host\'s environment variables and redeploy — it is read at ' +
        'build time, so a restart is not enough.'
    )
}

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true
})

export default api
