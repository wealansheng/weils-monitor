export const deepCopy = <T>(target: T): T => {
  if (typeof target === 'object' && target !== null) {
    const result = (Array.isArray(target) ? [] : {}) as T;

    for (const key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        const value = (target as Record<string, unknown>)[key];
        if (typeof value === 'object' && value !== null) {
          (result as Record<string, unknown>)[key] = deepCopy(value);
        } else {
          (result as Record<string, unknown>)[key] = value;
        }
      }
    }

    return result;
  }

  return target;
};