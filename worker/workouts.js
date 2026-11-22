export async function workouts(request, db, headers) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }
  const result = (body, status) => request.method === 'HEAD'
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });

  try {
    const { results } = await db.prepare('SELECT id, title, movement, equipment FROM workout_exercises ORDER BY rowid').all();
    return result({
      exercises: results.map((exercise) => ({ ...exercise, equipment: JSON.parse(exercise.equipment) })),
    }, 200);
  } catch {
    return result({ error: 'unavailable' }, 503);
  }
}
