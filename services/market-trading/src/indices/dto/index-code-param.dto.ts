import { IsString, Length } from 'class-validator';

// Index codes are matched case-insensitively but otherwise exactly: SL20TRI is
// a different series from SL20. The varchar(20) bound is enforced here so
// malformed input gets the standard validation envelope.
export class IndexCodeParamDto {
  @IsString()
  @Length(1, 20)
  code!: string;
}
