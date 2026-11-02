/** Preserve legacy ID-only saves, and validate per-instance appearance/placement options. */
function savedChibis(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => {
    if (typeof row === 'string') return row.length && row.length <= 200 ? [row] : [];
    if (!row || typeof row.id !== 'string' || !row.id.length || row.id.length > 200) return [];
    const result = { id: row.id };
    const p = row.preferences;
    if (p && typeof p === 'object') {
      const preferences = {};
      if (typeof p.pose === 'string' && p.pose.length <= 200) preferences.pose = p.pose;
      for (const key of ['loop','furniture','props','fixed','flipped']) if (typeof p[key] === 'boolean') preferences[key] = p[key];
      if (Number.isFinite(p.size)) preferences.size = Math.max(80, Math.min(300, p.size));
      if (Number.isFinite(p.offset)) preferences.offset = Math.max(-100, Math.min(100, p.offset));
      if (p.position && Number.isFinite(p.position.x) && Number.isFinite(p.position.y)) preferences.position = {x:Math.max(0,p.position.x),y:Math.max(0,p.position.y)};
      result.preferences = preferences;
    }
    return [result];
  }).slice(0, limit);
}
module.exports = { savedChibis };
