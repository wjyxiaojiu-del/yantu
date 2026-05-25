// Lightweight validation helpers

export function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rule] of Object.entries(rules)) {
      const value = req.body[field];
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} 不能为空`);
        continue;
      }
      if (value !== undefined && value !== null && value !== '') {
        if (rule.minLength && String(value).length < rule.minLength) {
          errors.push(`${field} 至少 ${rule.minLength} 个字符`);
        }
        if (rule.maxLength && String(value).length > rule.maxLength) {
          errors.push(`${field} 最多 ${rule.maxLength} 个字符`);
        }
        if (rule.pattern && !rule.pattern.test(String(value))) {
          errors.push(rule.message || `${field} 格式不正确`);
        }
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`${field} 必须是 ${rule.enum.join('/')} 之一`);
        }
      }
    }
    if (errors.length) {
      return res.status(400).json({ error: errors.join('；') });
    }
    next();
  };
}

export function validateQuery(rules) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rule] of Object.entries(rules)) {
      const value = req.query[field];
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} 不能为空`);
      }
    }
    if (errors.length) {
      return res.status(400).json({ error: errors.join('；') });
    }
    next();
  };
}

// Common patterns
export const Patterns = {
  phone: /^1[3-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
};
