// The api answers a field level problem as meta.details[] { field, message }, and the field paths are the
// same ones the forms use (departmentId, schedule.0.sessions.1.start). Both breadcrumbs matter: showing
// "Validation failed" over a form of six inputs tells the user nothing, and a schedule editor has enough
// nested fields that the path is what points at the window that is wrong.
export function applyServerErrors(error, setError, prefix = '') {
  const details = error?.details;

  if (!Array.isArray(details) || details.length === 0) {
    return false;
  }

  let applied = false;

  for (const detail of details) {
    if (!detail || !detail.field) {
      continue;
    }

    setError(`${prefix}${detail.field}`, { type: 'server', message: detail.message });
    applied = true;
  }

  return applied;
}
