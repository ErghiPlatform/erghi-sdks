import { ErghiClient } from '../client';
import { ErghiError, NotFoundError } from '../errors';
import { Workspace, CreateWorkspaceRequest } from '../types';

/** Row of `GET /api/v1/accounts/workspaces`. */
interface AccountWorkspaceSummary {
  workspaceId: string;
  name: string;
  slug?: string | null;
  isCurrent: boolean;
}

/** Body of `POST /api/v1/accounts/workspaces`. */
interface CreateWorkspaceResult {
  workspaceId: string;
  workspaceName: string;
}

function toWorkspace(row: AccountWorkspaceSummary): Workspace {
  return {
    id: row.workspaceId,
    name: row.name,
    slug: row.slug ?? '',
    isCurrent: row.isCurrent,
  };
}

/**
 * Workspaces of the signed-in user's account. The platform exposes list and
 * create; renaming and deleting a workspace are done in the admin portal.
 */
export class WorkspaceResource {
  constructor(private client: ErghiClient) {}

  /**
   * Get one of the account's workspaces by ID
   */
  async get(workspaceId: string): Promise<Workspace> {
    const workspace = (await this.list()).find((w) => w.id === workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${workspaceId} not found in this account`);
    }
    return workspace;
  }

  /**
   * List the workspaces of the signed-in user's account
   */
  async list(): Promise<Workspace[]> {
    const response = await this.client
      .getHttpClient()
      .get<AccountWorkspaceSummary[]>('/api/v1/accounts/workspaces');
    return response.data.map(toWorkspace);
  }

  /**
   * Create a new workspace in the signed-in user's account
   */
  async create(data: CreateWorkspaceRequest): Promise<Workspace> {
    const response = await this.client
      .getHttpClient()
      .post<CreateWorkspaceResult>('/api/v1/accounts/workspaces', {
        workspaceName: data.name,
        companyWebsite: data.companyWebsite,
      });

    // Set as current workspace
    this.client.setWorkspaceId(response.data.workspaceId);

    return {
      id: response.data.workspaceId,
      name: response.data.workspaceName,
      slug: '',
      isCurrent: false,
    };
  }

  /**
   * @deprecated The platform API has no workspace update endpoint; rename a
   * workspace in the admin portal. Always throws.
   */
  async update(_workspaceId: string, _data: Partial<CreateWorkspaceRequest>): Promise<Workspace> {
    throw new ErghiError('Updating a workspace is not supported by the API', 'NOT_SUPPORTED');
  }

  /**
   * @deprecated The platform API has no workspace delete endpoint; delete a
   * workspace in the admin portal. Always throws.
   */
  async delete(_workspaceId: string): Promise<void> {
    throw new ErghiError('Deleting a workspace is not supported by the API', 'NOT_SUPPORTED');
  }

  /**
   * Switch current workspace context
   */
  switchWorkspace(workspaceId: string): void {
    this.client.setWorkspaceId(workspaceId);
  }
}
