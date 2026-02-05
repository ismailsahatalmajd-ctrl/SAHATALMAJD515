export const getApiUrl = (path: string) => {
    // In development, handle relative paths or proxy
    if (path.startsWith('http')) return path
    return path
}
