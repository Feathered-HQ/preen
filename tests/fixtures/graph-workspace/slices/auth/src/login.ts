import { normalizeEmail } from "../../../common/src/util.js"
import type { User } from "./user.js"

export const login = (user: User): string => normalizeEmail(user.email)
