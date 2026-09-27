import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// Body of POST /developer/key and POST /developer/key/regenerate
// (docs/api/public-api-v1.md §7.2, §7.3). Trimmed here, at the boundary, so
// the service never has to decide what counts as whitespace: an omitted
// label stays `undefined` ("keep the existing label" on regenerate), a
// present-but-blank one trims to `''` (stored as null — see
// DeveloperKeysService), and anything left over past 100 characters is a
// validation failure, not a silently truncated label.
export class UpsertApiKeyDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  label?: string;
}
