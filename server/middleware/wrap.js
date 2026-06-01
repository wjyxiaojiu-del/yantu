// Shared async route wrapper for Express error handling
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
