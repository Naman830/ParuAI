import { createAuthClient } from "better-auth/react"
import { API_BASE_URL } from "@/configs/axios"

export const authClient = createAuthClient({
    // Must match the axios origin, otherwise the session cookie is set on one
    // host and read from another.
    baseURL: API_BASE_URL,
    fetchOptions: { credentials: 'include' }
})

export const { signIn, signUp, useSession } = authClient;
