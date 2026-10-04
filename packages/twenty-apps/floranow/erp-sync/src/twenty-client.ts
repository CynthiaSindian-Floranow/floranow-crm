import { type SyncConfig } from './env';

export type Lead = {
  id: string;
  name: string;
  businessName: string | null;
  debtorNumber: string | null;
  stage: string;
  source: string | null;
  vatNumber: string | null;
  companyId: string | null;
  ownerId: string | null;
  pointOfContactId: string | null;
};

export type Company = {
  id: string;
  name: string;
  debtorNumber: string | null;
};

// The company as Job B reads it — the mirror group plus identity. Extra REST
// fields are tolerated via the index signature; the diff only inspects keys
// that buildMirrorFields produces.
export type MirrorCompany = {
  id: string;
  name: string;
  debtorNumber: string | null;
  [field: string]: unknown;
};

type RestListResponse<T> = {
  data: Record<string, T[]>;
  pageInfo?: { hasNextPage: boolean; endCursor: string | null };
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class TwentyClient {
  constructor(private readonly config: SyncConfig) {}

  // Twenty rate-limits writes (100 per 60s). A bulk child sync can exceed that,
  // so a 429 is not an error — wait out the window and retry rather than
  // failing the run and leaving the upsert half done.
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
  ): Promise<T> {
    const response = await fetch(`${this.config.twentyUrl}/rest/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.twentyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 429 && attempt < 5) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 60_000;

      await sleep(waitMs + 1_000);

      return this.request<T>(method, path, body, attempt + 1);
    }

    if (!response.ok) {
      throw new Error(
        `Twenty ${method} /rest/${path} failed: HTTP ${response.status} ${await response.text()}`,
      );
    }

    return (await response.json()) as T;
  }

  private async listAll<T>(resource: string, filter?: string): Promise<T[]> {
    const records: T[] = [];
    let cursor: string | null = null;

    for (;;) {
      const params = new URLSearchParams({ limit: '60' });

      if (filter !== undefined) {
        params.set('filter', filter);
      }

      if (cursor !== null) {
        params.set('starting_after', cursor);
      }

      const page = await this.request<RestListResponse<T>>(
        'GET',
        `${resource}?${params.toString()}`,
      );

      records.push(...(page.data[resource] ?? []));

      if (page.pageInfo?.hasNextPage && page.pageInfo.endCursor) {
        cursor = page.pageInfo.endCursor;
      } else {
        return records;
      }
    }
  }

  async findQualifiedLeads(): Promise<Lead[]> {
    return await this.listAll<Lead>('opportunities', 'stage[eq]:QUALIFIED');
  }

  async findCompanyByDebtorNumber(
    debtorNumber: string,
  ): Promise<Company | null> {
    const companies = await this.listAll<Company>(
      'companies',
      `debtorNumber[eq]:"${debtorNumber.replace(/"/g, '')}"`,
    );

    return companies[0] ?? null;
  }

  async createCompany(fields: Record<string, unknown>): Promise<Company> {
    const response = await this.request<{ data: { createCompany: Company } }>(
      'POST',
      'companies',
      fields,
    );

    return response.data.createCompany;
  }

  async updateLead(
    leadId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.request('PATCH', `opportunities/${leadId}`, fields);
  }

  async findAllCompanies(): Promise<MirrorCompany[]> {
    return await this.listAll<MirrorCompany>('companies');
  }

  async updateCompany(
    companyId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.request('PATCH', `companies/${companyId}`, fields);
  }

  async attachPersonToCompany(
    personId: string,
    companyId: string,
  ): Promise<void> {
    await this.request('PATCH', `people/${personId}`, { companyId });
  }

  // Generic child-record access, keyed by the resource's plural REST path.
  async findChildrenByCompany(
    resource: string,
    companyId: string,
  ): Promise<Array<{ id: string } & Record<string, unknown>>> {
    return await this.listAll<{ id: string } & Record<string, unknown>>(
      resource,
      `companyId[eq]:"${companyId}"`,
    );
  }

  async createChild(
    resource: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.request('POST', resource, fields);
  }

  async updateChild(
    resource: string,
    id: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.request('PATCH', `${resource}/${id}`, fields);
  }
}
