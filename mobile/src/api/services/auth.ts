import { http } from '../client';
import type { AuthPayloadDto, Envelope } from '../dto';

export type RegisterInput = { name: string; email: string; password: string; passwordConfirmation: string; deviceName?: string };
export type LoginInput = { email: string; password: string; deviceName?: string };

const DEVICE_NAME = 'ECHO mobile';

export async function register(input: RegisterInput): Promise<AuthPayloadDto> {
  const res = await http.post<Envelope<AuthPayloadDto>>(
    '/auth/register',
    {
      name: input.name.trim(),
      email: input.email.trim(),
      password: input.password,
      password_confirmation: input.passwordConfirmation,
      device_name: input.deviceName ?? DEVICE_NAME,
    },
    { auth: false },
  );
  return res.data;
}

export async function login(input: LoginInput): Promise<AuthPayloadDto> {
  const res = await http.post<Envelope<AuthPayloadDto>>(
    '/auth/login',
    { email: input.email.trim(), password: input.password, device_name: input.deviceName ?? DEVICE_NAME },
    { auth: false },
  );
  return res.data;
}

/** Revokes this device's token on the server. */
export function logout(): Promise<void> {
  return http.post<void>('/auth/logout');
}
