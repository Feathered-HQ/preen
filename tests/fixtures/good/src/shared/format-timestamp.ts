export const formatTimestamp = (value: number): string => {
	return new Date(value).toISOString()
}
