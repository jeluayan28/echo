import { LIMITS } from '@/data/validation';

export const reflectionTitle = (about: string) => `Reflection: ${about}`.slice(0, LIMITS.title);
