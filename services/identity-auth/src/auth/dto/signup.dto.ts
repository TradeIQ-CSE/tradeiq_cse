import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

// POST /auth/signup body — docs/api/auth-v1.md §4.1. Property names match the
// wire body 1:1 so validation errors report the field the client actually sent
// (error-envelope.md §1).
//
// `role` is deliberately absent: every signup is an investor, and accepting it
// from the body would let a caller mint an admin.
export class SignupDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @Length(3, 320)
  email!: string;

  // A floor rather than a composition rule: length is what actually resists
  // guessing, and character-class rules mostly push people toward "Passw0rd!".
  // The cap keeps an over-long input from becoming an argon2 denial of service.
  @IsString()
  @Length(12, 128)
  password!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  display_name!: string;

  @IsOptional()
  @IsIn(['en', 'ta', 'si'])
  language_pref?: 'en' | 'ta' | 'si';
}
