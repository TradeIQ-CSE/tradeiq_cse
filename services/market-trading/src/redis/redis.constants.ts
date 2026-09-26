// A symbol, not a string, so nothing outside this module can collide with the
// token by accident.
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
