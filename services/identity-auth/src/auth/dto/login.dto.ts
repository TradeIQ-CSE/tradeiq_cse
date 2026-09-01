import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

// POST /auth/login body — docs/api/auth-v1.md §4.2.
//
// Neither field carries the format rules SignupDto uses. A stricter validator
// here would reject a malformed address with 400 VALIDATION_FAILED while a
// well-formed unknown one gets 401 INVALID_CREDENTIALS, and that difference
// tells an attacker which addresses are worth trying.
export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 320)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
