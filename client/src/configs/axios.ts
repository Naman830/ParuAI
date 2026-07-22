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

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true
})

export default api
