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

type RestListResponse<T> = {
  data: Record<string, T[]>;
  pageInfo?: { hasNextPage: boolean; endCursor: string | null };
};

export class TwentyClient {
  constructor(private readonly config: SyncConfig) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.config.twentyUrl}/rest/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.twentyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

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

  async attachPersonToCompany(
    personId: string,
    companyId: string,
  ): Promise<void> {
    await this.request('PATCH', `people/${personId}`, { companyId });
  }

  async createPerson(fields: Record<string, unknown>): Promise<void> {
    await this.request('POST', 'people', fields);
  }
}
