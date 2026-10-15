// user input that becomes a regular expression has to be neutralised first, otherwise a typed dot or
// bracket turns a search into a pattern of its own
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// anchored so the same search can use the nameLower index instead of scanning every document
function anchoredPrefix(value) {
  return new RegExp(`^${escapeRegExp(value)}`);
}

module.exports = { anchoredPrefix, escapeRegExp };
