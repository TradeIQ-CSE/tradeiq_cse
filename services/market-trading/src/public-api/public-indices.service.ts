import { Injectable } from '@nestjs/common';
import { IndicesService } from '../indices/indices.service';
import { PublicIndexValuesQueryDto } from './dto/public-index-values-query.dto';
import { PublicListIndicesQueryDto } from './dto/public-list-indices-query.dto';

export interface PublicIndex {
  code: string;
  name: string;
  latest: {
    date: string;
    close: number;
    change: number | null;
    change_pct: number | null;
  } | null;
}

export interface PublicIndexListResult {
  data: PublicIndex[];
  meta: { page: number; page_size: number; total: number };
}

export interface PublicIndexValuesResult {
  data: {
    code: string;
    name: string;
    from: string | null;
    to: string | null;
    values: { date: string; close: number }[];
  };
  meta: { page: number; page_size: number; total: number };
}

@Injectable()
export class PublicIndicesService {
  constructor(private readonly internalIndices: IndicesService) {}

  async list(query: PublicListIndicesQueryDto): Promise<PublicIndexListResult> {
    // Reused rather than re-queried: "each index at its own latest date,
    // gap-tolerant previous-value lookup" is the same rule IndicesService
    // already implements for the internal /indices route (§9 of the
    // catalogue). No `as_of` here — public-api-v1.md §6.4 has none.
    const internal = await this.internalIndices.list({});
    const all: PublicIndex[] = internal.data.map((item) => ({
      code: item.code,
      name: item.name,
      latest: item.latest
        ? {
            date: item.latest.date,
            close: item.latest.close,
            change: item.latest.change,
            change_pct: item.latest.change_pct,
          }
        : null,
    }));

    const start = (query.page - 1) * query.page_size;
    return {
      data: all.slice(start, start + query.page_size),
      meta: { page: query.page, page_size: query.page_size, total: all.length },
    };
  }

  async values(
    code: string,
    query: PublicIndexValuesQueryDto,
  ): Promise<PublicIndexValuesResult> {
    // Reused for the code lookup/404, defaulting and validation, and the
    // "no gap-filling, no carried-forward value" semantics.
    const internal = await this.internalIndices.values(code, {
      from: query.from,
      to: query.to,
    });

    const start = (query.page - 1) * query.page_size;
    const values = internal.data.values.slice(start, start + query.page_size);

    return {
      data: {
        code: internal.data.code,
        name: internal.data.name,
        from: internal.data.from,
        to: internal.data.to,
        values,
      },
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: internal.data.values.length,
      },
    };
  }
}
