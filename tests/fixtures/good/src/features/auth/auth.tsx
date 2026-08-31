import { formatTimestamp } from "../../shared/format-timestamp"
import { useLogin } from "./hooks/useLogin"

export const Auth = () => {
	const login = useLogin()
	return formatTimestamp(login.lastSeen)
}
