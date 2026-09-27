import { IsString, Length } from 'class-validator';

// Path parameter for /public/v1/indices/{code}/values —
// docs/api/public-api-v1.md §6.5. Matched case-insensitively but otherwise
// exactly (SL20TRI is a different series from SL20); the varchar(20) bound is
// enforced here.
export class PublicIndexCodeParamDto {
  @IsString()
  @Length(1, 20)
  code!: string;
}
