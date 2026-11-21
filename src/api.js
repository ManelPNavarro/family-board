export async function api(url, options) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'manual',
    ...options,
  });
  if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
    throw new Error('session');
  }
  if (!response.ok) throw new Error('unavailable');
  return response.status === 204 ? null : response.json();
}
