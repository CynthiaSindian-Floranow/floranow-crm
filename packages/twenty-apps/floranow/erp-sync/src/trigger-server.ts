import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';

const PORT = Number(process.env.TRIGGER_PORT || 8080);
const NAMESPACE = process.env.POD_NAMESPACE || process.env.NAMESPACE || 'dev';
const CRONJOB_NAME = process.env.CRONJOB_NAME || 'crm-erp-sync-provision';
const AUTH_KEY = process.env.MANUAL_TRIGGER_AUTH_KEY;

const K8S_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const K8S_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const K8S_API = 'https://kubernetes.default.svc';

const getK8sCa = (): Buffer | undefined => {
  if (existsSync(K8S_CA_PATH)) {
    return readFileSync(K8S_CA_PATH);
  }
  return undefined;
};

const getK8sToken = (): string => {
  if (existsSync(K8S_TOKEN_PATH)) {
    return readFileSync(K8S_TOKEN_PATH, 'utf8').trim();
  }
  return process.env.K8S_TOKEN || '';
};

const sendJson = (res: ServerResponse, statusCode: number, data: unknown) => {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

interface K8sResponse<T = any> {
  statusCode: number;
  data: T;
  raw: string;
}

const k8sRequest = async <T = any>(
  method: 'GET' | 'POST',
  apiPath: string,
  bodyPayload?: any,
): Promise<K8sResponse<T>> => {
  const token = getK8sToken();
  const ca = getK8sCa();
  const url = new URL(apiPath, K8S_API);

  const postData = bodyPayload ? JSON.stringify(bodyPayload) : undefined;

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method,
        ca,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let data: any = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }
          resolve({ statusCode: res.statusCode || 500, data, raw });
        });
      },
    );

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
};

const handleProvisionTrigger = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  // 1. Authenticate Request
  const clientKey = req.headers['x-floranow-sync-key'];
  if (AUTH_KEY && clientKey !== AUTH_KEY) {
    return sendJson(res, 401, { error: 'Unauthorized: Invalid or missing X-Floranow-Sync-Key' });
  }

  try {
    // 2. Check for active running provision jobs (Concurrency Lock)
    const listRes = await k8sRequest(
      'GET',
      `/apis/batch/v1/namespaces/${NAMESPACE}/jobs?labelSelector=floranow.com/lane=provision`,
    );

    if (listRes.statusCode >= 200 && listRes.statusCode < 300) {
      const jobList = listRes.data as { items?: Array<{ status?: { active?: number } }> };
      const hasActive = jobList.items?.some((j) => (j.status?.active ?? 0) > 0);
      if (hasActive) {
        return sendJson(res, 200, {
          status: 'in_progress',
          message: 'A provisioning run is already active. Duplicate request ignored.',
        });
      }
    }

    // 3. Fetch CronJob template to clone
    const cronRes = await k8sRequest(
      'GET',
      `/apis/batch/v1/namespaces/${NAMESPACE}/cronjobs/${CRONJOB_NAME}`,
    );

    if (cronRes.statusCode !== 200) {
      throw new Error(`Failed to read CronJob ${CRONJOB_NAME}: HTTP ${cronRes.statusCode} - ${cronRes.raw}`);
    }

    const cronJob = cronRes.data as {
      spec: {
        jobTemplate: {
          metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> };
          spec: any;
        };
      };
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const jobName = `${CRONJOB_NAME}-manual-${timestamp}`;

    const newJobPayload = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        namespace: NAMESPACE,
        labels: {
          'app.kubernetes.io/name': 'crm-erp-sync',
          'floranow.com/lane': 'provision',
          'floranow.com/trigger': 'manual-crm-button',
          ...cronJob.spec.jobTemplate.metadata?.labels,
        },
        annotations: {
          ...cronJob.spec.jobTemplate.metadata?.annotations,
          'floranow.com/triggered-by': 'crm-webhook',
          'floranow.com/triggered-at': new Date().toISOString(),
        },
      },
      spec: cronJob.spec.jobTemplate.spec,
    };

    // 4. Create Job in Kubernetes
    const createRes = await k8sRequest(
      'POST',
      `/apis/batch/v1/namespaces/${NAMESPACE}/jobs`,
      newJobPayload,
    );

    if (createRes.statusCode !== 201) {
      throw new Error(`Failed to create Job: HTTP ${createRes.statusCode} ${createRes.raw}`);
    }

    // 5. Fast Asynchronous Acknowledgment (< 30ms)
    return sendJson(res, 200, {
      status: 'triggered',
      jobName,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Trigger error:', error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz' || url.pathname === '/health') {
    return sendJson(res, 200, { status: 'healthy', uptime: process.uptime() });
  }

  if (url.pathname === '/sync/provision') {
    return handleProvisionTrigger(req, res);
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Floranow Sync Trigger Service running on port ${PORT}`);
  console.log(`Namespace: ${NAMESPACE} | CronJob Target: ${CRONJOB_NAME}`);
});
